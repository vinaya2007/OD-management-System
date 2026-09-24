-- Production workflow hardening. Apply after 202609230001_initial_schema.sql.

create table academic_years (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  start_date date not null,
  end_date date not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create unique index academic_years_one_active_idx on academic_years ((is_active)) where is_active;

insert into academic_years (name, start_date, end_date, is_active)
select distinct academic_year, date_trunc('year', current_date)::date, (date_trunc('year', current_date) + interval '1 year - 1 day')::date,
  academic_year = (select max(academic_year) from od_limits)
from od_limits
on conflict (name) do nothing;

alter table od_limits add column if not exists academic_year_id uuid references academic_years(id);
update od_limits limits set academic_year_id = years.id from academic_years years where years.name = limits.academic_year and limits.academic_year_id is null;
alter table od_limits alter column academic_year_id set not null;
create index if not exists od_limits_active_idx on od_limits (academic_year_id, category) where is_active;

alter table od_applications add column if not exists academic_year_id uuid references academic_years(id);
update od_applications applications set academic_year_id = years.id from academic_years years where years.is_active and applications.academic_year_id is null;
alter table od_applications alter column academic_year_id set not null;
alter table od_applications add column if not exists idempotency_key uuid;
create unique index if not exists od_applications_student_idempotency_idx on od_applications (student_id, idempotency_key) where idempotency_key is not null;
create index if not exists od_applications_year_status_idx on od_applications (academic_year_id, status);

create table audit_logs (
  id uuid primary key default uuid_generate_v4(),
  actor_id uuid references profiles(id) on delete set null,
  od_id uuid references od_applications(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_od_created_idx on audit_logs (od_id, created_at desc);

create table system_settings (
  id uuid primary key default uuid_generate_v4(),
  key text not null unique,
  value jsonb not null,
  updated_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table academic_years enable row level security;
alter table audit_logs enable row level security;
alter table system_settings enable row level security;

-- The allowed domain is deployment configuration, not a hard-coded database constant.
alter table profiles drop constraint if exists profiles_email_check;

create or replace function set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists departments_updated_at on departments;
create trigger departments_updated_at before update on departments for each row execute function set_updated_at();
drop trigger if exists profiles_updated_at on profiles;
create trigger profiles_updated_at before update on profiles for each row execute function set_updated_at();
drop trigger if exists od_applications_updated_at on od_applications;
create trigger od_applications_updated_at before update on od_applications for each row execute function set_updated_at();
drop trigger if exists od_faculty_approvals_updated_at on od_faculty_approvals;
create trigger od_faculty_approvals_updated_at before update on od_faculty_approvals for each row execute function set_updated_at();
drop trigger if exists special_permissions_updated_at on special_permissions;
create trigger special_permissions_updated_at before update on special_permissions for each row execute function set_updated_at();
drop trigger if exists academic_years_updated_at on academic_years;
create trigger academic_years_updated_at before update on academic_years for each row execute function set_updated_at();
drop trigger if exists system_settings_updated_at on system_settings;
create trigger system_settings_updated_at before update on system_settings for each row execute function set_updated_at();

drop policy if exists "active users can read active profiles in department" on profiles;
create policy "scoped profile visibility" on profiles for select using (
  auth.uid() = auth_user_id
  or current_role() = 'admin'
  or (current_role() in ('faculty', 'hod') and department_id = (current_profile()).department_id)
);

drop policy if exists "students read own ods" on od_applications;
create policy "scoped od visibility" on od_applications for select using (
  student_id = (current_profile()).id
  or current_role() = 'admin'
  or (current_role() = 'hod' and department_id = (current_profile()).department_id)
  or exists (select 1 from od_faculty_approvals approval where approval.od_id = od_applications.id and approval.faculty_id = (current_profile()).id)
);

drop policy if exists "periods follow od visibility" on od_periods;
create policy "periods follow scoped od visibility" on od_periods for select using (
  exists (select 1 from od_applications application where application.id = od_periods.od_id and (
    application.student_id = (current_profile()).id
    or current_role() = 'admin'
    or (current_role() = 'hod' and application.department_id = (current_profile()).department_id)
    or exists (select 1 from od_faculty_approvals approval where approval.od_id = application.id and approval.faculty_id = (current_profile()).id)
  ))
);

create policy "authenticated users read academic years" on academic_years for select using (auth.uid() is not null);
create policy "admin manages academic years" on academic_years for all using (current_role() = 'admin') with check (current_role() = 'admin');
create policy "admin reads audit logs" on audit_logs for select using (current_role() = 'admin');
create policy "admin manages system settings" on system_settings for all using (current_role() = 'admin') with check (current_role() = 'admin');
create policy "authenticated users read system settings" on system_settings for select using (auth.uid() is not null);

-- Workflow writes are only available through the SECURITY DEFINER functions below.
revoke insert, update, delete on od_applications, od_periods, od_faculty_approvals, special_permissions, notifications from authenticated;

create or replace function active_profile_or_error()
returns profiles language plpgsql stable security definer set search_path = public as $$
declare profile_row profiles;
begin
  select * into profile_row from profiles where auth_user_id = auth.uid() and is_active limit 1;
  if profile_row.id is null then raise exception 'UNAUTHORIZED' using errcode = 'P0001'; end if;
  return profile_row;
end $$;

create or replace function active_academic_year_or_error()
returns academic_years language plpgsql stable security definer set search_path = public as $$
declare year_row academic_years;
begin
  select * into year_row from academic_years where is_active limit 1;
  if year_row.id is null then raise exception 'No active academic year is configured' using errcode = 'P0001'; end if;
  return year_row;
end $$;

create or replace function submit_od_application(p_payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  profile_row profiles := active_profile_or_error();
  year_row academic_years := active_academic_year_or_error();
  new_id uuid;
  existing_id uuid;
  faculty_count integer;
  active_faculty_count integer;
  requested_special boolean := coalesce(nullif(p_payload->>'special_reason', ''), '') <> '';
  period_item jsonb;
  limit_count integer;
  used_count integer;
begin
  if profile_row.role <> 'student' then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_payload->>'idempotency_key' is null then raise exception 'VALIDATION_ERROR' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext(profile_row.id::text));
  select id into existing_id from od_applications where student_id = profile_row.id and idempotency_key = (p_payload->>'idempotency_key')::uuid;
  if existing_id is not null then return existing_id; end if;
  if (p_payload->>'start_date')::date > (p_payload->>'end_date')::date then raise exception 'VALIDATION_ERROR' using errcode = 'P0001'; end if;

  select count(*), count(*) filter (where faculty.role = 'faculty' and faculty.is_active and faculty.department_id = profile_row.department_id)
  into faculty_count, active_faculty_count
  from profiles faculty where faculty.id in (select jsonb_array_elements_text(p_payload->'faculty_ids')::uuid);
  if jsonb_array_length(p_payload->'faculty_ids') not between 1 and 3 or faculty_count <> jsonb_array_length(p_payload->'faculty_ids') or active_faculty_count <> faculty_count then
    raise exception 'FACULTY_NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  if (select count(distinct jsonb_array_elements_text(p_payload->'faculty_ids'))) <> jsonb_array_length(p_payload->'faculty_ids') then raise exception 'VALIDATION_ERROR' using errcode = 'P0001'; end if;

  for period_item in select value from jsonb_array_elements(p_payload->'periods') loop
    if (period_item->>'date')::date not between (p_payload->>'start_date')::date and (p_payload->>'end_date')::date
      or (period_item->>'from_period')::integer not between 1 and 7 or (period_item->>'to_period')::integer not between 1 and 7
      or (period_item->>'from_period')::integer > (period_item->>'to_period')::integer then raise exception 'VALIDATION_ERROR' using errcode = 'P0001'; end if;
  end loop;
  if (select count(*) from jsonb_array_elements(p_payload->'periods')) <> (select count(distinct value->>'date') from jsonb_array_elements(p_payload->'periods')) then raise exception 'VALIDATION_ERROR' using errcode = 'P0001'; end if;

  select application.id into existing_id
  from od_applications application join od_periods existing_period on existing_period.od_id = application.id
  join jsonb_to_recordset(p_payload->'periods') as incoming(date date, from_period integer, to_period integer) on incoming.date = existing_period.date and incoming.from_period <= existing_period.to_period and existing_period.from_period <= incoming.to_period
  where application.student_id = profile_row.id and application.status not in ('REJECTED', 'WITHDRAWN') limit 1;
  if existing_id is not null then raise exception 'OD_OVERLAP:%', existing_id using errcode = 'P0001'; end if;

  select limit_count into limit_count from od_limits where academic_year_id = year_row.id and category = p_payload->>'category' and is_active limit 1;
  select count(*) into used_count from od_applications where student_id = profile_row.id and academic_year_id = year_row.id and category = p_payload->>'category' and status = 'APPROVED';
  if limit_count is not null and used_count >= limit_count and not requested_special then raise exception 'OD_LIMIT_REACHED' using errcode = 'P0001'; end if;

  insert into od_applications (student_id, department_id, academic_year_id, idempotency_key, category, purpose, event_name, venue_type, college_name, start_date, end_date, additional_notes, is_special, special_permission_status, status)
  values (profile_row.id, profile_row.department_id, year_row.id, (p_payload->>'idempotency_key')::uuid, p_payload->>'category', nullif(p_payload->>'purpose',''), p_payload->>'event_name', p_payload->>'venue_type', nullif(p_payload->>'college_name',''), (p_payload->>'start_date')::date, (p_payload->>'end_date')::date, nullif(p_payload->>'additional_notes',''), requested_special, case when requested_special then 'PENDING'::special_permission_status else 'NOT_REQUIRED'::special_permission_status end, 'FACULTY_REVIEW') returning id into new_id;
  insert into od_periods (od_id, date, from_period, to_period) select new_id, item.date, item.from_period, item.to_period from jsonb_to_recordset(p_payload->'periods') as item(date date, from_period integer, to_period integer);
  insert into od_faculty_approvals (od_id, faculty_id) select new_id, jsonb_array_elements_text(p_payload->'faculty_ids')::uuid;
  if requested_special then insert into special_permissions (od_id, requested_by, reason) values (new_id, profile_row.id, p_payload->>'special_reason'); end if;
  insert into notifications (user_id, od_id, type, title, message) select faculty_id, new_id, 'OD_ASSIGNED', 'New OD approval assigned', 'An OD application is awaiting your review.' from od_faculty_approvals where od_id = new_id;
  insert into notifications (user_id, od_id, type, title, message) values (profile_row.id, new_id, 'OD_SUBMITTED', 'OD submitted', 'Your OD application has entered faculty review.');
  insert into audit_logs (actor_id, od_id, action, metadata) values (profile_row.id, new_id, 'OD_SUBMITTED', jsonb_build_object('is_special', requested_special));
  return new_id;
end $$;

create or replace function decide_faculty_od(p_od_id uuid, p_decision faculty_approval_status, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
declare profile_row profiles := active_profile_or_error(); application od_applications; all_approved boolean;
begin
  if profile_row.role <> 'faculty' then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_decision not in ('APPROVED', 'CORRECTION_REQUESTED', 'REJECTED') or (p_decision <> 'APPROVED' and nullif(trim(p_comment), '') is null) then raise exception 'VALIDATION_ERROR' using errcode = 'P0001'; end if;
  select * into application from od_applications where id = p_od_id for update;
  if application.id is null or application.status not in ('FACULTY_REVIEW', 'CORRECTION_REQUESTED') then raise exception 'INVALID_STATUS_TRANSITION' using errcode = 'P0001'; end if;
  update od_faculty_approvals set status = p_decision, comment = nullif(trim(p_comment), ''), approved_at = case when p_decision = 'APPROVED' then now() else null end where od_id = p_od_id and faculty_id = profile_row.id and status = 'PENDING';
  if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_decision = 'REJECTED' then update od_applications set status = 'REJECTED' where id = p_od_id; elsif p_decision = 'CORRECTION_REQUESTED' then update od_applications set status = 'CORRECTION_REQUESTED' where id = p_od_id; else select bool_and(status = 'APPROVED') into all_approved from od_faculty_approvals where od_id = p_od_id; if all_approved then update od_applications set status = 'HOD_REVIEW' where id = p_od_id; end if; end if;
  insert into notifications (user_id, od_id, type, title, message) values (application.student_id, p_od_id, p_decision::text, 'Faculty review updated', coalesce(nullif(trim(p_comment), ''), 'A faculty approver has approved your OD.'));
  insert into audit_logs (actor_id, od_id, action, metadata) values (profile_row.id, p_od_id, 'FACULTY_' || p_decision::text, jsonb_build_object('comment', p_comment));
end $$;

create or replace function decide_hod_od(p_od_id uuid, p_approved boolean, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
declare profile_row profiles := active_profile_or_error(); application od_applications;
begin
  if profile_row.role not in ('hod', 'admin') or (not p_approved and nullif(trim(p_comment), '') is null) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into application from od_applications where id = p_od_id for update;
  if application.id is null or application.department_id is distinct from profile_row.department_id or application.status <> 'HOD_REVIEW' or exists (select 1 from od_faculty_approvals where od_id = p_od_id and status <> 'APPROVED') then raise exception 'INVALID_STATUS_TRANSITION' using errcode = 'P0001'; end if;
  update od_applications set status = case when p_approved then 'APPROVED'::od_status else 'REJECTED'::od_status end where id = p_od_id;
  insert into notifications (user_id, od_id, type, title, message) values (application.student_id, p_od_id, case when p_approved then 'HOD_APPROVED' else 'HOD_REJECTED' end, case when p_approved then 'OD approved' else 'OD rejected' end, coalesce(nullif(trim(p_comment), ''), 'Your OD has been approved by the HOD.'));
  insert into audit_logs (actor_id, od_id, action, metadata) values (profile_row.id, p_od_id, case when p_approved then 'HOD_APPROVED' else 'HOD_REJECTED' end, jsonb_build_object('comment', p_comment));
end $$;

create or replace function replace_pending_faculty(p_od_id uuid, p_approval_id uuid, p_faculty_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare profile_row profiles := active_profile_or_error(); application od_applications; replacement profiles;
begin
  if profile_row.role <> 'student' then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into application from od_applications where id = p_od_id for update;
  select * into replacement from profiles where id = p_faculty_id and role = 'faculty' and is_active and department_id = profile_row.department_id;
  if application.student_id <> profile_row.id or application.status not in ('FACULTY_REVIEW', 'CORRECTION_REQUESTED') or replacement.id is null or exists (select 1 from od_faculty_approvals where od_id = p_od_id and faculty_id = p_faculty_id) then raise exception 'FACULTY_NOT_AVAILABLE' using errcode = 'P0001'; end if;
  update od_faculty_approvals set faculty_id = p_faculty_id, status = 'PENDING', comment = null, approved_at = null where id = p_approval_id and od_id = p_od_id and status = 'PENDING';
  if not found then raise exception 'INVALID_STATUS_TRANSITION' using errcode = 'P0001'; end if;
  insert into notifications (user_id, od_id, type, title, message) values (p_faculty_id, p_od_id, 'OD_ASSIGNED', 'New OD approval assigned', 'An OD application is awaiting your review.');
  insert into audit_logs (actor_id, od_id, action, metadata) values (profile_row.id, p_od_id, 'FACULTY_REPLACED', jsonb_build_object('approval_id', p_approval_id));
end $$;

create or replace function withdraw_od(p_od_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare profile_row profiles := active_profile_or_error();
begin
  update od_applications set status = 'WITHDRAWN' where id = p_od_id and student_id = profile_row.id and status in ('SUBMITTED', 'FACULTY_REVIEW', 'CORRECTION_REQUESTED');
  if not found then raise exception 'INVALID_STATUS_TRANSITION' using errcode = 'P0001'; end if;
  insert into audit_logs (actor_id, od_id, action) values (profile_row.id, p_od_id, 'OD_WITHDRAWN');
end $$;

grant execute on function submit_od_application(jsonb), decide_faculty_od(uuid, faculty_approval_status, text), decide_hod_od(uuid, boolean, text), replace_pending_faculty(uuid, uuid, uuid), withdraw_od(uuid) to authenticated;
