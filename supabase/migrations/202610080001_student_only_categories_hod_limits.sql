-- Canonical Student OD categories, authenticated-student ownership, and
-- department-scoped HOD limit controls. Existing request/student history stays.

alter table public.od_limits add column if not exists category text;
alter table public.od_limits drop constraint if exists od_limits_department_id_academic_year_id_key;
create unique index if not exists od_limits_department_year_category_key
  on public.od_limits(department_id, academic_year_id, category) where category is not null;
alter table public.od_limits add constraint od_limits_category_check
  check (category is null or category in ('Non-Technical','Technical','Club Organizer / Volunteer'));
alter table public.od_limits add constraint od_limits_max_check
  check (category is null or max_ods is null or max_ods between 0 and 365);
grant select(year) on public.profiles to authenticated;

-- Students can view only OD requests they submitted. Staff visibility keeps
-- the existing assigned-faculty and department-HOD rules intact.
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
      select 1 from public.od_request_faculty f where f.od_request_id=p_request_id and f.faculty_id=actor.id));
end $$;
create or replace function public.can_view_profile(p_profile_id uuid)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare actor public.profiles := public.active_profile_or_error(); target public.profiles;
begin
  select * into target from public.profiles where id=p_profile_id and is_active;
  if target.id is null then return false; end if;
  return target.id=actor.id or actor.role='admin'
    or (actor.role in ('faculty','hod') and target.department_id=actor.department_id)
    or (actor.role='student' and target.role='faculty' and target.department_id=actor.department_id);
end $$;
alter function public.can_access_od_request(uuid) set row_security=off;
alter function public.can_view_profile(uuid) set row_security=off;
revoke all on function public.can_access_od_request(uuid),public.can_view_profile(uuid) from public,anon;
grant execute on function public.can_access_od_request(uuid),public.can_view_profile(uuid) to authenticated;
drop function if exists public.search_ece_students(text);

-- A student can read only their own student-link row, including for legacy
-- requests that once contained multiple recipients.
drop policy if exists "request students scoped read current workflow" on public.od_request_students;
drop policy if exists "od request students scoped read" on public.od_request_students;
create policy "od request students scoped read" on public.od_request_students for select to authenticated using (
  public.can_access_od_request(request_id)
  and (public.current_role() <> 'student' or student_id=(public.current_profile()).id)
);

-- Seed category defaults for every active academic year; legacy department-wide
-- rows are retained for compatibility and are not used for new submissions.
insert into public.od_limits(department_id, academic_year_id, category, max_ods)
select d.id, y.id, c.category, c.max_ods
from public.departments d
cross join public.academic_years y
cross join (values ('Non-Technical',3),('Technical',5),('Club Organizer / Volunteer',3)) c(category,max_ods)
where y.is_active
on conflict (department_id, academic_year_id, category) where category is not null do nothing;

create or replace function public.seed_active_od_category_limits()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.is_active then
    insert into public.od_limits(department_id,academic_year_id,category,max_ods)
    select d.id,new.id,c.category,c.max_ods from public.departments d
    cross join (values ('Non-Technical',3),('Technical',5),('Club Organizer / Volunteer',3)) c(category,max_ods)
    on conflict (department_id,academic_year_id,category) where category is not null do nothing;
  end if;
  return new;
end $$;
drop trigger if exists seed_active_od_category_limits on public.academic_years;
create trigger seed_active_od_category_limits after insert or update of is_active on public.academic_years
for each row execute function public.seed_active_od_category_limits();

-- HOD scope and department are derived exclusively from active_profile_or_error.
create or replace function public.save_hod_od_category_limits(p_limits jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare actor public.profiles := public.active_profile_or_error(); entry record;
begin
  if actor.role <> 'hod' or actor.department_id is null or jsonb_typeof(p_limits) <> 'array' then
    raise exception 'FORBIDDEN' using errcode='P0001';
  end if;
  if (select count(*) from jsonb_array_elements(p_limits)) <> 3 then
    raise exception 'Provide all three OD category limits.' using errcode='P0001';
  end if;
  if (select count(distinct value->>'category') from jsonb_array_elements(p_limits)) <> 3 then
    raise exception 'Each OD category limit must be provided exactly once.' using errcode='P0001';
  end if;
  for entry in select value->>'category' category, (value->>'max_ods')::integer max_ods from jsonb_array_elements(p_limits)
  loop
    if entry.category is null or entry.category not in ('Non-Technical','Technical','Club Organizer / Volunteer')
       or entry.max_ods is null or entry.max_ods not between 0 and 365 then
      raise exception 'Invalid OD category limit.' using errcode='P0001';
    end if;
    insert into public.od_limits(department_id,academic_year_id,category,max_ods)
    select actor.department_id,y.id,entry.category,entry.max_ods from public.academic_years y where y.is_active
    on conflict (department_id,academic_year_id,category) where category is not null
    do update set max_ods=excluded.max_ods,updated_at=now();
  end loop;
end $$;
revoke all on function public.save_hod_od_category_limits(jsonb) from public,anon;
grant execute on function public.save_hod_od_category_limits(jsonb) to authenticated;

-- Each submission is tied to the authenticated student only. Any student_ids
-- field supplied by a hostile browser is ignored. Only APPROVED, non-duplicate
-- ODs count toward the annual category limit; pending, rejected, withdrawn,
-- and duplicate requests do not consume the allowance.
create or replace function public.submit_od_request(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  actor public.profiles := public.active_profile_or_error();
  new_id uuid := coalesce(nullif(p_payload->>'id','')::uuid,gen_random_uuid());
  year_id uuid;
  category_value text := nullif(trim(p_payload->>'od_category'),'');
  reason_value text := nullif(trim(p_payload->>'reason'),'');
  request_date date := (p_payload->>'event_date')::date;
  period_from smallint := nullif(p_payload->>'start_period','')::smallint;
  period_to smallint := nullif(p_payload->>'end_period','')::smallint;
  limit_value integer;
  used_count integer;
  duplicate_found boolean := false;
begin
  if actor.role <> 'student' or actor.department_id is null or actor.register_number is null or actor.section is null or actor.year is null then
    raise exception 'Required student identity details are missing from the OD record. Contact the ECE administrator.' using errcode='P0001';
  end if;
  select id into year_id from public.academic_years where is_active limit 1;
  if year_id is null then raise exception 'No active academic year is configured.' using errcode='P0001'; end if;
  if nullif(p_payload->>'idempotency_key','') is null or jsonb_typeof(p_payload->'faculty_ids') is distinct from 'array' then
    raise exception 'Select at least one faculty reviewer.' using errcode='P0001';
  end if;
  if category_value is null or category_value not in ('Non-Technical','Technical','Club Organizer / Volunteer') then
    raise exception 'Select a valid OD category.' using errcode='P0001';
  end if;
  if reason_value is null or length(reason_value) not between 5 and 2000 then raise exception 'A purpose of at least 5 characters is required.' using errcode='P0001'; end if;
  if nullif(trim(p_payload->>'event_name'),'') is null then raise exception 'Event name is required.' using errcode='P0001'; end if;
  if (p_payload->>'end_time')::time <= (p_payload->>'start_time')::time then raise exception 'End time must be after start time.' using errcode='P0001'; end if;
  if period_from not between 1 and 9 or period_to not between period_from and 9 then raise exception 'Select a valid period range from 1 to 9.' using errcode='P0001'; end if;
  if jsonb_array_length(p_payload->'faculty_ids') not between 1 and 3 then raise exception 'Select one to three faculty reviewers.' using errcode='P0001'; end if;
  if exists(select 1 from jsonb_array_elements_text(p_payload->'faculty_ids') x(value)
    left join public.profiles p on p.id=x.value::uuid and p.role='faculty' and p.is_active and p.department_id=actor.department_id where p.id is null)
    then raise exception 'One or more faculty reviewers are unavailable.' using errcode='P0001'; end if;
  if (select count(distinct value::uuid) from jsonb_array_elements_text(p_payload->'faculty_ids')) <> jsonb_array_length(p_payload->'faculty_ids')
    then raise exception 'Faculty reviewers must be unique.' using errcode='P0001'; end if;

  perform pg_advisory_xact_lock(hashtextextended(actor.id::text || ':' || year_id::text || ':' || category_value,0));
  select max_ods into limit_value from public.od_limits
    where department_id=actor.department_id and academic_year_id=year_id and category=category_value;
  if limit_value is null then
    limit_value := case category_value when 'Technical' then 5 else 3 end;
  end if;
  select count(*) into used_count from public.od_requests r
    where r.academic_year_id=year_id and r.od_category=category_value
      and r.status='APPROVED' and not coalesce(r.is_potential_duplicate,false)
      and (r.requester_id=actor.id or exists(select 1 from public.od_request_students s where s.request_id=r.id and s.student_id=actor.id));
  if used_count >= limit_value then raise exception 'OD limit reached for this category.' using errcode='P0001'; end if;

  select exists(select 1 from public.od_requests prior
    join public.od_request_students ps on ps.request_id=prior.id
    where prior.department_id=actor.department_id and prior.event_date=request_date
      and lower(prior.event_name)=lower(trim(p_payload->>'event_name'))
      and prior.status not in ('REJECTED_BY_FACULTY','REJECTED_BY_HOD','WITHDRAWN')
      and (p_payload->>'start_time')::time < coalesce(prior.end_time,'23:59:59'::time)
      and prior.start_time < (p_payload->>'end_time')::time and ps.student_id=actor.id) into duplicate_found;

  insert into public.od_requests(id,requester_id,department_id,academic_year_id,event_name,od_category,reason,event_type,organization,event_date,start_period,end_period,start_time,end_time,venue,purpose,requester_remarks,status,is_potential_duplicate,idempotency_key)
  values(new_id,actor.id,actor.department_id,year_id,trim(p_payload->>'event_name'),category_value,reason_value,category_value,
    nullif(trim(p_payload->>'organization'),''),request_date,period_from,period_to,(p_payload->>'start_time')::time,(p_payload->>'end_time')::time,
    trim(p_payload->>'venue'),reason_value,nullif(trim(p_payload->>'requester_remarks'),''),'PENDING_FACULTY',duplicate_found,(p_payload->>'idempotency_key')::uuid)
  on conflict(requester_id,idempotency_key) where idempotency_key is not null do nothing;
  if not found then
    select id into new_id from public.od_requests where requester_id=actor.id and idempotency_key=(p_payload->>'idempotency_key')::uuid;
    return jsonb_build_object('id',new_id,'potentialDuplicate',false);
  end if;

  insert into public.od_request_students(request_id,student_id) values(new_id,actor.id);
  insert into public.od_request_faculty(od_request_id,faculty_id)
    select new_id,value::uuid from jsonb_array_elements_text(p_payload->'faculty_ids') x(value);
  insert into public.od_approval_history(od_request_id,actor_id,actor_role,action,to_status)
    values(new_id,actor.id,'student','SUBMITTED','PENDING_FACULTY');
  insert into public.notifications(user_id,od_request_id,notification_type,title,message)
    select distinct target.user_id,new_id,'OD_REQUEST_SUBMITTED','OD request submitted','A new OD request requires your review.'
    from (select actor.id user_id union select value::uuid from jsonb_array_elements_text(p_payload->'faculty_ids') x(value)) target;
  return jsonb_build_object('id',new_id,'potentialDuplicate',duplicate_found);
end $$;
revoke all on function public.submit_od_request(jsonb) from public,anon;
grant execute on function public.submit_od_request(jsonb) to authenticated;
notify pgrst,'reload schema';
