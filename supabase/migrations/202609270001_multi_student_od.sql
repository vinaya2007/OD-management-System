-- Multi-recipient OD requests, registration/profile provisioning, and attendance.
-- Additive migration: legacy od_applications remain intact and are copied below.

do $$ begin
  create type od_request_status as enum ('PENDING_FACULTY','REJECTED_BY_FACULTY','PENDING_HOD','REJECTED_BY_HOD','APPROVED','WITHDRAWN');
exception when duplicate_object then null; end $$;
do $$ begin
  create type od_attendance_status as enum ('PRESENT','ABSENT');
exception when duplicate_object then null; end $$;

insert into departments (name, code, is_active)
values ('Electronics and Communication Engineering', 'ECE', true)
on conflict (code) do update set name = excluded.name;

create table if not exists od_requests (
  id uuid primary key default uuid_generate_v4(),
  requester_id uuid not null references profiles(id),
  department_id uuid not null references departments(id),
  event_name text not null check (char_length(trim(event_name)) between 2 and 250),
  event_type text not null,
  organization text,
  event_date date not null,
  event_end_date date,
  start_time time,
  end_time time,
  venue text not null,
  purpose text,
  supporting_document_url text,
  requester_remarks text,
  status od_request_status not null default 'PENDING_FACULTY',
  faculty_id uuid references profiles(id),
  faculty_action_at timestamptz,
  faculty_remarks text,
  hod_id uuid references profiles(id),
  hod_action_at timestamptz,
  hod_remarks text,
  is_potential_duplicate boolean not null default false,
  idempotency_key uuid,
  legacy_od_id uuid unique references od_applications(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (event_end_date is null or event_end_date >= event_date),
  check (start_time is null or end_time is null or end_time > start_time),
  unique (requester_id, idempotency_key)
);
create index if not exists od_requests_status_department_date_idx on od_requests (department_id, status, event_date desc);
create index if not exists od_requests_requester_created_idx on od_requests (requester_id, created_at desc);
create index if not exists od_requests_event_date_idx on od_requests (event_date, status);

create table if not exists od_request_students (
  id uuid primary key default uuid_generate_v4(),
  od_request_id uuid not null references od_requests(id) on delete cascade,
  student_id uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  unique (od_request_id, student_id)
);
create index if not exists od_request_students_student_idx on od_request_students (student_id, od_request_id);

create table if not exists od_request_faculty (
  id uuid primary key default uuid_generate_v4(),
  od_request_id uuid not null references od_requests(id) on delete cascade,
  faculty_id uuid not null references profiles(id),
  status faculty_approval_status not null default 'PENDING',
  comment text,
  action_at timestamptz,
  created_at timestamptz not null default now(),
  unique (od_request_id, faculty_id)
);
create index if not exists od_request_faculty_assignment_idx on od_request_faculty (faculty_id, status, od_request_id);

create table if not exists od_attendance (
  id uuid primary key default uuid_generate_v4(),
  od_request_id uuid not null references od_requests(id) on delete cascade,
  student_id uuid not null references profiles(id),
  attendance_status od_attendance_status not null,
  marked_by uuid not null references profiles(id),
  marked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (od_request_id, student_id)
);
create index if not exists od_attendance_student_idx on od_attendance (student_id, marked_at desc);

create table if not exists od_approval_history (
  id uuid primary key default uuid_generate_v4(),
  od_request_id uuid not null references od_requests(id) on delete cascade,
  actor_id uuid references profiles(id) on delete set null,
  actor_role user_role not null,
  action text not null,
  from_status od_request_status,
  to_status od_request_status,
  remarks text,
  created_at timestamptz not null default now()
);
create index if not exists od_approval_history_request_idx on od_approval_history (od_request_id, created_at);

alter table notifications add column if not exists od_request_id uuid references od_requests(id) on delete cascade;
create index if not exists notifications_od_request_idx on notifications (od_request_id, created_at desc);

alter table od_requests enable row level security;
alter table od_request_students enable row level security;
alter table od_request_faculty enable row level security;
alter table od_attendance enable row level security;
alter table od_approval_history enable row level security;

-- Backfill old single-student records as requests submitted for that same student.
insert into od_requests (
  id, requester_id, department_id, event_name, event_type, organization, event_date, event_end_date,
  venue, purpose, requester_remarks, status, is_potential_duplicate, legacy_od_id, created_at, updated_at
)
select old.id, old.student_id, old.department_id, old.event_name, old.category, old.college_name, old.start_date, old.end_date,
  old.venue_type, old.purpose, old.additional_notes,
  case old.status
    when 'APPROVED' then 'APPROVED'::od_request_status
    when 'WITHDRAWN' then 'WITHDRAWN'::od_request_status
    when 'HOD_REVIEW' then 'PENDING_HOD'::od_request_status
    when 'FACULTY_APPROVED' then 'PENDING_HOD'::od_request_status
    when 'REJECTED' then case when exists(select 1 from od_faculty_approvals a where a.od_id=old.id and a.status='REJECTED') then 'REJECTED_BY_FACULTY'::od_request_status else 'REJECTED_BY_HOD'::od_request_status end
    else 'PENDING_FACULTY'::od_request_status
  end,
  old.is_special, old.id, old.created_at, old.updated_at
from od_applications old
on conflict (id) do nothing;
insert into od_request_students (od_request_id, student_id)
select request.id, request.requester_id from od_requests request where request.legacy_od_id is not null
on conflict (od_request_id, student_id) do nothing;
insert into od_request_faculty (od_request_id, faculty_id, status, comment, action_at, created_at)
select request.id, approval.faculty_id, approval.status, approval.comment, approval.approved_at, approval.created_at
from od_faculty_approvals approval join od_requests request on request.legacy_od_id=approval.od_id
on conflict (od_request_id, faculty_id) do nothing;
insert into od_approval_history (od_request_id, actor_id, actor_role, action, from_status, to_status, remarks, created_at)
select request.id, request.requester_id, 'student', 'LEGACY_IMPORTED', null, request.status, 'Imported from the previous OD application workflow.', request.created_at
from od_requests request where request.legacy_od_id is not null
  and not exists(select 1 from od_approval_history history where history.od_request_id=request.id);

-- New Auth identities can only self-provision as students. Privileged roles are never read from metadata.
create or replace function provision_student_profile_for_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare dept_id uuid; profile_name text; register_no text; section_value text;
begin
  if new.email is null or lower(split_part(new.email, '@', 2)) <> 'srmist.edu.in' then
    raise exception 'Only verified @srmist.edu.in accounts are allowed.' using errcode = '23514';
  end if;
  select id into dept_id from departments where code='ECE' and is_active limit 1;
  if dept_id is null then raise exception 'ECE department is not configured.' using errcode = '23514'; end if;
  profile_name := coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), nullif(trim(new.raw_user_meta_data->>'name'), ''), split_part(new.email, '@', 1));
  register_no := nullif(upper(trim(new.raw_user_meta_data->>'register_number')), '');
  section_value := nullif(upper(trim(new.raw_user_meta_data->>'section')), '');
  if register_no is not null and register_no !~ '^RA[A-Z0-9]{6,18}$' then raise exception 'Invalid SRMIST register number.' using errcode = '23514'; end if;
  if section_value is not null and section_value not in ('A','B') then raise exception 'Section must be A or B.' using errcode = '23514'; end if;
  insert into profiles (auth_user_id, name, email, role, department_id, register_number, section, is_active)
  values (new.id, profile_name, lower(new.email), 'student', dept_id, register_no, section_value, true)
  on conflict (auth_user_id) do nothing;
  return new;
end $$;
drop trigger if exists auth_user_provision_student_profile on auth.users;
create trigger auth_user_provision_student_profile after insert on auth.users
for each row execute function provision_student_profile_for_auth_user();
revoke all on function provision_student_profile_for_auth_user() from public, anon, authenticated;

-- Bind every authenticated workflow RPC to a confirmed SRMIST Auth identity.
create or replace function active_profile_or_error()
returns profiles language plpgsql stable security definer set search_path = public as $$
declare profile_row profiles; verified_email text;
begin
  select email into verified_email from auth.users
  where id=auth.uid() and email_confirmed_at is not null and lower(split_part(email,'@',2))='srmist.edu.in';
  if verified_email is null then raise exception 'UNAUTHORIZED' using errcode='P0001'; end if;
  select * into profile_row from profiles where auth_user_id=auth.uid() and is_active and lower(email)=lower(verified_email) limit 1;
  if profile_row.id is null then raise exception 'UNAUTHORIZED' using errcode='P0001'; end if;
  return profile_row;
end $$;
revoke all on function active_profile_or_error() from public, anon;
grant execute on function active_profile_or_error() to authenticated;

create unique index if not exists profiles_register_number_ci_unique on profiles (lower(register_number)) where register_number is not null;
alter table profiles drop constraint if exists profiles_section_check;
alter table profiles add constraint profiles_section_check check (section is null or section in ('A','B'));

create or replace function complete_student_profile(p_full_name text, p_register_number text, p_section text)
returns void language plpgsql security definer set search_path = public as $$
declare actor profiles := active_profile_or_error(); register_no text := upper(trim(p_register_number)); section_value text := upper(trim(p_section));
begin
  if actor.role <> 'student' or actor.auth_user_id <> auth.uid() or lower(split_part(actor.email,'@',2)) <> 'srmist.edu.in'
    or length(trim(p_full_name)) not between 2 and 120 or register_no !~ '^RA[A-Z0-9]{6,18}$' or section_value not in ('A','B') then
    raise exception 'Invalid profile details.' using errcode = 'P0001';
  end if;
  update profiles set name=trim(p_full_name), register_number=register_no, section=section_value,
    department_id=(select id from departments where code='ECE' and is_active limit 1)
  where id=actor.id;
end $$;

create or replace function search_ece_students(p_query text)
returns table(id uuid, name text, register_number text, section text, department text)
language plpgsql stable security definer set search_path = public as $$
declare actor profiles := active_profile_or_error(); term text;
begin
  if actor.role <> 'student' or length(trim(coalesce(p_query,''))) < 2 or length(p_query) > 80 then
    raise exception 'Enter at least two characters to search.' using errcode = 'P0001';
  end if;
  term := replace(replace(replace(trim(p_query), '\', '\\'), '%', '\%'), '_', '\_');
  return query select p.id, p.name, p.register_number, p.section, d.name
  from profiles p join departments d on d.id=p.department_id
  where p.role='student' and p.is_active and p.department_id=actor.department_id
    and p.id <> actor.id
    and (p.register_number ilike '%'||term||'%' escape '\' or p.name ilike '%'||term||'%' escape '\')
  order by p.name limit 20;
end $$;

-- Restrict recipient profile visibility to participants, requesters, or department staff.
drop policy if exists "scoped profile visibility" on profiles;
drop policy if exists "active users can read active profiles in department" on profiles;
create policy "multi od scoped profile visibility" on profiles for select using (
  auth.uid() = auth_user_id
  or current_role() = 'admin'
  or (current_role() in ('faculty','hod') and department_id=(current_profile()).department_id)
  or (current_role()='student' and role='faculty' and is_active and department_id=(current_profile()).department_id)
  or (current_role()='student' and role='student' and exists (
    select 1 from od_request_students recipient join od_requests request on request.id=recipient.od_request_id
    where recipient.student_id=profiles.id and (
      request.requester_id=(current_profile()).id
      or exists(select 1 from od_request_students mine where mine.od_request_id=request.id and mine.student_id=(current_profile()).id)
    )
  ))
);

create policy "od requests scoped read" on od_requests for select using (
  requester_id=(current_profile()).id
  or exists(select 1 from od_request_students recipient where recipient.od_request_id=od_requests.id and recipient.student_id=(current_profile()).id)
  or exists(select 1 from od_request_faculty assigned where assigned.od_request_id=od_requests.id and assigned.faculty_id=(current_profile()).id)
  or (current_role()='hod' and department_id=(current_profile()).department_id)
  or current_role()='admin'
);
create policy "request students scoped read" on od_request_students for select using (
  exists(select 1 from od_requests request where request.id=od_request_students.od_request_id)
);
create policy "request faculty scoped read" on od_request_faculty for select using (
  faculty_id=(current_profile()).id or current_role()='admin'
  or (current_role()='hod' and exists(select 1 from od_requests request where request.id=od_request_faculty.od_request_id and request.department_id=(current_profile()).department_id))
  or exists(select 1 from od_requests request join od_request_students student on student.od_request_id=request.id where request.id=od_request_faculty.od_request_id and (request.requester_id=(current_profile()).id or student.student_id=(current_profile()).id))
);
create policy "attendance scoped read" on od_attendance for select using (
  student_id=(current_profile()).id or current_role()='admin'
  or (current_role() in ('faculty','hod') and exists(select 1 from od_requests request where request.id=od_attendance.od_request_id and request.department_id=(current_profile()).department_id))
);
create policy "approval history scoped read" on od_approval_history for select using (
  current_role()='admin'
  or exists(select 1 from od_requests request where request.id=od_approval_history.od_request_id and (
    request.requester_id=(current_profile()).id
    or exists(select 1 from od_request_students student where student.od_request_id=request.id and student.student_id=(current_profile()).id)
    or (current_role() in ('faculty','hod') and request.department_id=(current_profile()).department_id)
  ))
);
grant select on od_requests, od_request_students, od_request_faculty, od_attendance, od_approval_history to authenticated;
revoke insert, update, delete on od_requests, od_request_students, od_request_faculty, od_attendance, od_approval_history from anon, authenticated;

create or replace function submit_od_request(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare actor profiles := active_profile_or_error(); new_id uuid := coalesce(nullif(p_payload->>'id','')::uuid, uuid_generate_v4()); item_id uuid; faculty_count integer; student_count integer; duplicate_found boolean := false;
begin
  if actor.role <> 'student' or actor.department_id is null or actor.register_number is null or actor.section is null then raise exception 'Complete your student profile before submitting a request.' using errcode='P0001'; end if;
  if nullif(p_payload->>'idempotency_key','') is null then raise exception 'Request token is required.' using errcode='P0001'; end if;
  if nullif(trim(p_payload->>'event_name'),'') is null or (p_payload->>'event_date') is null
    or nullif(trim(p_payload->>'start_time'),'') is null or nullif(trim(p_payload->>'end_time'),'') is null
    or (p_payload->>'end_time')::time <= (p_payload->>'start_time')::time
    or nullif(trim(p_payload->>'venue'),'') is null then raise exception 'Please complete the event details and time range.' using errcode='P0001'; end if;
  if coalesce(jsonb_typeof(p_payload->'student_ids'),'') <> 'array' or coalesce(jsonb_typeof(p_payload->'faculty_ids'),'') <> 'array' then raise exception 'Select OD students and faculty reviewers.' using errcode='P0001'; end if;
  if jsonb_array_length(p_payload->'student_ids') not between 1 and 50 or jsonb_array_length(p_payload->'faculty_ids') not between 1 and 3 then raise exception 'Select at least one OD student and one to three faculty reviewers.' using errcode='P0001'; end if;
  select count(*), count(distinct item::uuid) into student_count, faculty_count from jsonb_array_elements_text(p_payload->'student_ids') as items(item);
  if student_count <> faculty_count then raise exception 'An OD student cannot be selected more than once.' using errcode='P0001'; end if;
  select count(*), count(distinct item::uuid) into student_count, faculty_count from jsonb_array_elements_text(p_payload->'faculty_ids') as items(item);
  if student_count <> faculty_count then raise exception 'A faculty reviewer cannot be selected more than once.' using errcode='P0001'; end if;
  if exists(select 1 from jsonb_array_elements_text(p_payload->'student_ids') x left join profiles p on p.id=x.value::uuid and p.role='student' and p.is_active and p.department_id=actor.department_id where p.id is null)
    then raise exception 'One or more selected OD students are unavailable.' using errcode='P0001'; end if;
  if exists(select 1 from jsonb_array_elements_text(p_payload->'faculty_ids') x left join profiles p on p.id=x.value::uuid and p.role='faculty' and p.is_active and p.department_id=actor.department_id where p.id is null)
    then raise exception 'One or more faculty reviewers are unavailable.' using errcode='P0001'; end if;
  select exists(select 1 from od_requests prior join od_request_students prior_student on prior_student.od_request_id=prior.id
    where prior.department_id=actor.department_id and prior.event_date=(p_payload->>'event_date')::date
      and lower(prior.event_name)=lower(trim(p_payload->>'event_name')) and prior.status not in ('REJECTED_BY_FACULTY','REJECTED_BY_HOD','WITHDRAWN')
      and (p_payload->>'start_time')::time < coalesce(prior.end_time,'23:59:59'::time)
      and prior.start_time < (p_payload->>'end_time')::time
      and prior_student.student_id in (select item::uuid from jsonb_array_elements_text(p_payload->'student_ids') as items(item))
  ) into duplicate_found;
  insert into od_requests (id, requester_id, department_id, event_name, event_type, organization, event_date, start_time, end_time, venue, purpose, requester_remarks, status, is_potential_duplicate, idempotency_key)
  values (new_id, actor.id, actor.department_id, trim(p_payload->>'event_name'), coalesce(nullif(trim(p_payload->>'event_type'),''),'Other'), nullif(trim(p_payload->>'organization'),''), (p_payload->>'event_date')::date, (p_payload->>'start_time')::time, (p_payload->>'end_time')::time, trim(p_payload->>'venue'), nullif(trim(p_payload->>'purpose'),''), nullif(trim(p_payload->>'requester_remarks'),''), 'PENDING_FACULTY', duplicate_found, (p_payload->>'idempotency_key')::uuid)
  on conflict (requester_id,idempotency_key) do nothing;
  if not found then select id into new_id from od_requests where requester_id=actor.id and idempotency_key=(p_payload->>'idempotency_key')::uuid; return jsonb_build_object('id',new_id,'potentialDuplicate',false); end if;
  insert into od_request_students (od_request_id,student_id) select new_id,item::uuid from jsonb_array_elements_text(p_payload->'student_ids') as items(item);
  insert into od_request_faculty (od_request_id,faculty_id) select new_id,item::uuid from jsonb_array_elements_text(p_payload->'faculty_ids') as items(item);
  insert into od_approval_history (od_request_id,actor_id,actor_role,action,to_status) values (new_id,actor.id,'student','SUBMITTED','PENDING_FACULTY');
  insert into notifications (user_id,od_request_id,type,title,message)
    select distinct recipients.user_id,new_id,'OD_REQUEST_SUBMITTED','OD request submitted','A new OD request was submitted for your review.'
    from (select actor.id user_id union select item::uuid from jsonb_array_elements_text(p_payload->'student_ids') as students(item) union select p.id from profiles p where p.id in (select item::uuid from jsonb_array_elements_text(p_payload->'faculty_ids') as faculty(item))) recipients;
  return jsonb_build_object('id',new_id,'potentialDuplicate',duplicate_found);
end $$;

create or replace function decide_od_request_faculty(p_request_id uuid,p_approved boolean,p_remarks text default null)
returns void language plpgsql security definer set search_path = public as $$
declare actor profiles := active_profile_or_error(); request_row od_requests; next_status od_request_status;
begin
  if actor.role<>'faculty' or (not p_approved and nullif(trim(p_remarks),'') is null) then raise exception 'FORBIDDEN' using errcode='P0001'; end if;
  select * into request_row from od_requests where id=p_request_id for update;
  if request_row.id is null or request_row.department_id<>actor.department_id or request_row.status<>'PENDING_FACULTY'
    or not exists(select 1 from od_request_faculty where od_request_id=p_request_id and faculty_id=actor.id and status='PENDING') then raise exception 'INVALID_STATUS_TRANSITION' using errcode='P0001'; end if;
  next_status := case when p_approved then 'PENDING_HOD'::od_request_status else 'REJECTED_BY_FACULTY'::od_request_status end;
  update od_request_faculty set status=case when p_approved then 'APPROVED'::faculty_approval_status else 'REJECTED'::faculty_approval_status end, comment=nullif(trim(p_remarks),''), action_at=now() where od_request_id=p_request_id and faculty_id=actor.id;
  update od_requests set status=next_status, faculty_id=actor.id, faculty_action_at=now(), faculty_remarks=nullif(trim(p_remarks),''), updated_at=now() where id=p_request_id;
  insert into od_approval_history (od_request_id,actor_id,actor_role,action,from_status,to_status,remarks) values (p_request_id,actor.id,'faculty',case when p_approved then 'FACULTY_APPROVED' else 'FACULTY_REJECTED' end,'PENDING_FACULTY',next_status,p_remarks);
  insert into notifications (user_id,od_request_id,type,title,message)
    select distinct targets.user_id,p_request_id,case when p_approved then 'FACULTY_APPROVED' else 'FACULTY_REJECTED' end,
      case when p_approved then 'Faculty approved OD request' else 'Faculty rejected OD request' end,
      coalesce(nullif(trim(p_remarks),''),case when p_approved then 'Your OD request is pending HOD review.' else 'Your OD request was rejected by faculty.' end)
    from (select request_row.requester_id user_id union select student_id from od_request_students where od_request_id=p_request_id) targets;
  if p_approved then
    insert into notifications (user_id,od_request_id,type,title,message) select p.id,p_request_id,'OD_PENDING_HOD','OD request requires HOD review','A faculty-approved OD request is ready for your review.' from profiles p where p.role='hod' and p.is_active and p.department_id=actor.department_id;
  end if;
end $$;

create or replace function decide_od_request_hod(p_request_id uuid,p_approved boolean,p_remarks text default null)
returns void language plpgsql security definer set search_path = public as $$
declare actor profiles := active_profile_or_error(); request_row od_requests; next_status od_request_status;
begin
  if actor.role<>'hod' or (not p_approved and nullif(trim(p_remarks),'') is null) then raise exception 'FORBIDDEN' using errcode='P0001'; end if;
  select * into request_row from od_requests where id=p_request_id for update;
  if request_row.id is null or request_row.department_id<>actor.department_id or request_row.status<>'PENDING_HOD'
    or request_row.faculty_id is null or not exists(select 1 from od_request_faculty where od_request_id=p_request_id and faculty_id=request_row.faculty_id and status='APPROVED') then raise exception 'INVALID_STATUS_TRANSITION' using errcode='P0001'; end if;
  next_status := case when p_approved then 'APPROVED'::od_request_status else 'REJECTED_BY_HOD'::od_request_status end;
  update od_requests set status=next_status, hod_id=actor.id, hod_action_at=now(), hod_remarks=nullif(trim(p_remarks),''), updated_at=now() where id=p_request_id;
  insert into od_approval_history (od_request_id,actor_id,actor_role,action,from_status,to_status,remarks) values (p_request_id,actor.id,'hod',case when p_approved then 'HOD_APPROVED' else 'HOD_REJECTED' end,'PENDING_HOD',next_status,p_remarks);
  insert into notifications (user_id,od_request_id,type,title,message)
    select distinct targets.user_id,p_request_id,case when p_approved then 'HOD_APPROVED' else 'HOD_REJECTED' end,
      case when p_approved then 'OD request approved' else 'OD request rejected by HOD' end,
      coalesce(nullif(trim(p_remarks),''),case when p_approved then 'Your OD request has been approved.' else 'Your OD request was rejected by the HOD.' end)
    from (select request_row.requester_id user_id union select student_id from od_request_students where od_request_id=p_request_id union select faculty_id from od_request_faculty where od_request_id=p_request_id) targets;
end $$;

create or replace function mark_od_attendance(p_request_id uuid,p_student_id uuid,p_status od_attendance_status)
returns uuid language plpgsql security definer set search_path = public as $$
declare actor profiles := active_profile_or_error(); request_row od_requests; attendance_id uuid;
begin
  if actor.role<>'faculty' then raise exception 'FORBIDDEN' using errcode='P0001'; end if;
  select * into request_row from od_requests where id=p_request_id for share;
  if request_row.id is null or request_row.status<>'APPROVED' or request_row.department_id<>actor.department_id
    or not exists(select 1 from od_request_students where od_request_id=p_request_id and student_id=p_student_id) then raise exception 'FORBIDDEN' using errcode='P0001'; end if;
  insert into od_attendance (od_request_id,student_id,attendance_status,marked_by)
  values(p_request_id,p_student_id,p_status,actor.id)
  on conflict (od_request_id,student_id) do update set attendance_status=excluded.attendance_status,marked_by=excluded.marked_by,marked_at=now(),updated_at=now()
  returning id into attendance_id;
  return attendance_id;
end $$;

create or replace function withdraw_od_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare actor profiles := active_profile_or_error(); request_row od_requests;
begin
  if actor.role<>'student' then raise exception 'FORBIDDEN' using errcode='P0001'; end if;
  select * into request_row from od_requests where id=p_request_id for update;
  if request_row.id is null or request_row.requester_id<>actor.id or request_row.status not in ('PENDING_FACULTY','PENDING_HOD') then raise exception 'INVALID_STATUS_TRANSITION' using errcode='P0001'; end if;
  update od_requests set status='WITHDRAWN',updated_at=now() where id=p_request_id;
  insert into od_approval_history (od_request_id,actor_id,actor_role,action,from_status,to_status) values(p_request_id,actor.id,'student','WITHDRAWN',request_row.status,'WITHDRAWN');
  insert into notifications (user_id,od_request_id,type,title,message)
    select distinct targets.user_id,p_request_id,'OD_REQUEST_WITHDRAWN','OD request withdrawn','The requester withdrew this OD request.'
    from (select student_id user_id from od_request_students where od_request_id=p_request_id union select faculty_id from od_request_faculty where od_request_id=p_request_id) targets;
end $$;

grant execute on function complete_student_profile(text,text,text), search_ece_students(text), submit_od_request(jsonb), decide_od_request_faculty(uuid,boolean,text), decide_od_request_hod(uuid,boolean,text), mark_od_attendance(uuid,uuid,od_attendance_status), withdraw_od_request(uuid) to authenticated;
revoke all on function complete_student_profile(text,text,text), search_ece_students(text), submit_od_request(jsonb), decide_od_request_faculty(uuid,boolean,text), decide_od_request_hod(uuid,boolean,text), mark_od_attendance(uuid,uuid,od_attendance_status), withdraw_od_request(uuid) from public, anon;
