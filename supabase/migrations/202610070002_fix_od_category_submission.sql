-- Keep the existing OD category and reason columns required. The deployed
-- submission RPC was rewritten by the hardening migration and stopped
-- copying od_category/reason from the request payload.
create or replace function public.submit_od_request(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.profiles := public.active_profile_or_error();
  new_id uuid := coalesce(nullif(p_payload->>'id', '')::uuid, gen_random_uuid());
  year_id uuid;
  student_count integer;
  distinct_count integer;
  duplicate_found boolean := false;
  request_date date := (p_payload->>'event_date')::date;
  period_from smallint := nullif(p_payload->>'start_period', '')::smallint;
  period_to smallint := nullif(p_payload->>'end_period', '')::smallint;
  category_value text := nullif(trim(p_payload->>'od_category'), '');
  reason_value text := nullif(trim(p_payload->>'reason'), '');
begin
  if actor.role <> 'student' or actor.department_id is null or actor.register_number is null or actor.section is null or actor.year is null then
    raise exception 'Required student identity details are missing from the OD record. Contact the ECE administrator.' using errcode = 'P0001';
  end if;

  select id into year_id from public.academic_years where is_active = true limit 1;
  if year_id is null then raise exception 'No active academic year is configured.' using errcode = 'P0001'; end if;
  if nullif(p_payload->>'idempotency_key', '') is null
     or jsonb_typeof(p_payload->'student_ids') <> 'array'
     or jsonb_typeof(p_payload->'faculty_ids') <> 'array' then
    raise exception 'Select OD students and faculty reviewers.' using errcode = 'P0001';
  end if;
  if category_value is null then raise exception 'OD category is required.' using errcode = 'P0001'; end if;
  if category_value not in ('Technical Event', 'Non-Technical Event', 'Hackathon', 'Sports', 'College Event', 'Internship', 'Club Organizer / Coordinator', 'Other') then
    raise exception 'Select a valid OD category.' using errcode = 'P0001';
  end if;
  if reason_value is null or length(reason_value) not between 5 and 2000 then
    raise exception 'A purpose of at least 5 characters is required.' using errcode = 'P0001';
  end if;
  if nullif(trim(p_payload->>'event_name'), '') is null then raise exception 'Event name is required.' using errcode = 'P0001'; end if;

  student_count := jsonb_array_length(p_payload->'student_ids');
  if student_count < 1 then raise exception 'Select at least one OD student.' using errcode = 'P0001'; end if;
  select count(distinct value::uuid) into distinct_count from jsonb_array_elements_text(p_payload->'student_ids');
  if distinct_count <> student_count then raise exception 'An OD student cannot be selected more than once.' using errcode = 'P0001'; end if;
  if exists (
    select 1 from jsonb_array_elements_text(p_payload->'student_ids') ids(value)
    left join public.profiles p on p.id = ids.value::uuid and p.role = 'student' and p.is_active and p.department_id = actor.department_id
    where p.id is null
  ) then raise exception 'One or more selected OD students are unavailable.' using errcode = 'P0001'; end if;
  if exists (
    select 1 from jsonb_array_elements_text(p_payload->'faculty_ids') ids(value)
    left join public.profiles p on p.id = ids.value::uuid and p.role = 'faculty' and p.is_active and p.department_id = actor.department_id
    where p.id is null
  ) then raise exception 'One or more faculty reviewers are unavailable.' using errcode = 'P0001'; end if;
  if (p_payload->>'end_time')::time <= (p_payload->>'start_time')::time then raise exception 'End time must be after start time.' using errcode = 'P0001'; end if;
  if period_from not between 1 and 9 or period_to not between period_from and 9 then raise exception 'Select a valid period range from 1 to 9.' using errcode = 'P0001'; end if;

  select exists (
    select 1
    from public.od_requests prior
    join public.od_request_students ps on ps.request_id = prior.id
    where prior.department_id = actor.department_id
      and prior.event_date = request_date
      and lower(prior.event_name) = lower(trim(p_payload->>'event_name'))
      and prior.status not in ('REJECTED_BY_FACULTY', 'REJECTED_BY_HOD', 'WITHDRAWN')
      and (p_payload->>'start_time')::time < coalesce(prior.end_time, '23:59:59'::time)
      and prior.start_time < (p_payload->>'end_time')::time
      and ps.student_id in (select value::uuid from jsonb_array_elements_text(p_payload->'student_ids') ids(value))
  ) into duplicate_found;

  insert into public.od_requests (
    id, requester_id, department_id, academic_year_id, event_name, od_category, reason,
    event_type, organization, event_date, start_period, end_period, start_time, end_time,
    venue, purpose, requester_remarks, status, is_potential_duplicate, idempotency_key
  ) values (
    new_id, actor.id, actor.department_id, year_id, trim(p_payload->>'event_name'), category_value, reason_value,
    coalesce(nullif(trim(p_payload->>'event_type'), ''), category_value), nullif(trim(p_payload->>'organization'), ''), request_date,
    period_from, period_to, (p_payload->>'start_time')::time, (p_payload->>'end_time')::time,
    trim(p_payload->>'venue'), reason_value, nullif(trim(p_payload->>'requester_remarks'), ''), 'PENDING_FACULTY',
    duplicate_found, (p_payload->>'idempotency_key')::uuid
  ) on conflict (requester_id, idempotency_key) where idempotency_key is not null do nothing;

  if not found then
    select id into new_id from public.od_requests
    where requester_id = actor.id and idempotency_key = (p_payload->>'idempotency_key')::uuid;
    return jsonb_build_object('id', new_id, 'potentialDuplicate', false);
  end if;

  insert into public.od_request_students(request_id, student_id)
    select new_id, value::uuid from jsonb_array_elements_text(p_payload->'student_ids') ids(value);
  insert into public.od_request_faculty(od_request_id, faculty_id)
    select new_id, value::uuid from jsonb_array_elements_text(p_payload->'faculty_ids') ids(value);
  insert into public.od_approval_history(od_request_id, actor_id, actor_role, action, to_status)
    values (new_id, actor.id, 'student', 'SUBMITTED', 'PENDING_FACULTY');
  insert into public.notifications(user_id, od_request_id, notification_type, title, message)
    select distinct targets.user_id, new_id, 'OD_REQUEST_SUBMITTED', 'OD request submitted', 'A new OD request requires your review.'
    from (
      select actor.id as user_id
      union select value::uuid from jsonb_array_elements_text(p_payload->'student_ids') ids(value)
      union select value::uuid from jsonb_array_elements_text(p_payload->'faculty_ids') ids(value)
    ) targets;
  return jsonb_build_object('id', new_id, 'potentialDuplicate', duplicate_found);
end;
$$;

grant execute on function public.submit_od_request(jsonb) to authenticated;
revoke all on function public.submit_od_request(jsonb) from public, anon;
notify pgrst, 'reload schema';
