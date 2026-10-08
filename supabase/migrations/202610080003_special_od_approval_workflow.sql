-- Special OD requests remain regular od_requests with a canonical type flag.
-- Limit eligibility and all approval decisions are enforced server-side.

alter table public.od_requests
  add column if not exists is_special_od boolean not null default false;

create index if not exists od_requests_special_department_status_idx
  on public.od_requests(department_id, status, created_at desc)
  where is_special_od;

-- Eligibility is computed from the authenticated student's profile and the
-- active academic year. Only final, non-duplicate regular approvals count.
create or replace function public.get_special_od_eligibility(p_category text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare
  actor public.profiles := public.active_profile_or_error();
  year_id uuid;
  limit_value integer;
  used_count integer;
begin
  if actor.role <> 'student' or actor.department_id is null then
    raise exception 'FORBIDDEN' using errcode='P0001';
  end if;
  if p_category not in ('Non-Technical','Technical','Club Organizer / Volunteer') then
    raise exception 'Select a valid OD category.' using errcode='P0001';
  end if;
  select id into year_id from public.academic_years where is_active limit 1;
  if year_id is null then raise exception 'No active academic year is configured.' using errcode='P0001'; end if;
  select max_ods into limit_value from public.od_limits
    where department_id=actor.department_id and academic_year_id=year_id and category=p_category;
  if limit_value is null then limit_value := case p_category when 'Technical' then 5 else 3 end; end if;
  select count(*) into used_count from public.od_requests r
    where r.academic_year_id=year_id and r.od_category=p_category and r.status='APPROVED'
      and not coalesce(r.is_potential_duplicate,false) and not coalesce(r.is_special_od,false)
      and (r.requester_id=actor.id or exists(select 1 from public.od_request_students s where s.request_id=r.id and s.student_id=actor.id));
  return jsonb_build_object('eligible',used_count >= limit_value,'used',used_count,'limit',limit_value);
end $$;
revoke all on function public.get_special_od_eligibility(text) from public,anon;
grant execute on function public.get_special_od_eligibility(text) to authenticated;

-- Keep regular OD limit enforcement intact and exclude approved Special ODs
-- from consuming the student's normal category allowance.
create or replace function public.submit_od_request(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  actor public.profiles := public.active_profile_or_error();
  new_id uuid := gen_random_uuid();
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
  select max_ods into limit_value from public.od_limits where department_id=actor.department_id and academic_year_id=year_id and category=category_value;
  if limit_value is null then limit_value := case category_value when 'Technical' then 5 else 3 end; end if;
  select count(*) into used_count from public.od_requests r
    where r.academic_year_id=year_id and r.od_category=category_value and r.status='APPROVED'
      and not coalesce(r.is_potential_duplicate,false) and not coalesce(r.is_special_od,false)
      and (r.requester_id=actor.id or exists(select 1 from public.od_request_students s where s.request_id=r.id and s.student_id=actor.id));
  if used_count >= limit_value then raise exception 'OD limit reached for this category.' using errcode='P0001'; end if;

  select exists(select 1 from public.od_requests prior join public.od_request_students ps on ps.request_id=prior.id
    where prior.department_id=actor.department_id and prior.event_date=request_date and lower(prior.event_name)=lower(trim(p_payload->>'event_name'))
      and prior.status not in ('REJECTED_BY_FACULTY','REJECTED_BY_HOD','WITHDRAWN')
      and (p_payload->>'start_time')::time < coalesce(prior.end_time,'23:59:59'::time)
      and prior.start_time < (p_payload->>'end_time')::time and ps.student_id=actor.id) into duplicate_found;

  insert into public.od_requests(id,requester_id,department_id,academic_year_id,event_name,od_category,reason,event_type,organization,event_date,start_period,end_period,start_time,end_time,venue,purpose,requester_remarks,status,is_special_od,is_potential_duplicate,idempotency_key)
  values(new_id,actor.id,actor.department_id,year_id,trim(p_payload->>'event_name'),category_value,reason_value,category_value,
    nullif(trim(p_payload->>'organization'),''),request_date,period_from,period_to,(p_payload->>'start_time')::time,(p_payload->>'end_time')::time,
    trim(p_payload->>'venue'),reason_value,nullif(trim(p_payload->>'requester_remarks'),''),'PENDING_FACULTY',false,duplicate_found,(p_payload->>'idempotency_key')::uuid)
  on conflict(requester_id,idempotency_key) where idempotency_key is not null do nothing;
  if not found then
    select id into new_id from public.od_requests where requester_id=actor.id and idempotency_key=(p_payload->>'idempotency_key')::uuid;
    return jsonb_build_object('id',new_id,'potentialDuplicate',false);
  end if;
  insert into public.od_request_students(request_id,student_id) values(new_id,actor.id);
  insert into public.od_request_faculty(od_request_id,faculty_id) select new_id,value::uuid from jsonb_array_elements_text(p_payload->'faculty_ids') x(value);
  insert into public.od_approval_history(od_request_id,actor_id,actor_role,action,to_status) values(new_id,actor.id,'student','SUBMITTED','PENDING_FACULTY');
  insert into public.notifications(user_id,od_request_id,notification_type,title,message)
    select distinct target.user_id,new_id,'OD_REQUEST_SUBMITTED','OD request submitted','A new OD request requires your review.'
    from (select actor.id user_id union select value::uuid from jsonb_array_elements_text(p_payload->'faculty_ids') x(value)) target;
  return jsonb_build_object('id',new_id,'potentialDuplicate',duplicate_found);
end $$;
revoke all on function public.submit_od_request(jsonb) from public,anon;
grant execute on function public.submit_od_request(jsonb) to authenticated;

create or replace function public.submit_special_od_request(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  actor public.profiles := public.active_profile_or_error();
  new_id uuid := gen_random_uuid(); year_id uuid; category_value text := nullif(trim(p_payload->>'od_category'),'');
  reason_value text := nullif(trim(p_payload->>'reason'),''); request_date date := (p_payload->>'event_date')::date;
  period_from smallint := nullif(p_payload->>'start_period','')::smallint; period_to smallint := nullif(p_payload->>'end_period','')::smallint;
  limit_value integer; used_count integer; duplicate_found boolean := false;
begin
  if actor.role <> 'student' or actor.department_id is null or actor.register_number is null or actor.section is null or actor.year is null then
    raise exception 'Required student identity details are missing from the OD record. Contact the ECE administrator.' using errcode='P0001';
  end if;
  select id into year_id from public.academic_years where is_active limit 1;
  if year_id is null then raise exception 'No active academic year is configured.' using errcode='P0001'; end if;
  if nullif(p_payload->>'idempotency_key','') is null or jsonb_typeof(p_payload->'faculty_ids') is distinct from 'array' then raise exception 'Select at least one faculty reviewer.' using errcode='P0001'; end if;
  if category_value is null or category_value not in ('Non-Technical','Technical','Club Organizer / Volunteer') then raise exception 'Select a valid OD category.' using errcode='P0001'; end if;
  if reason_value is null or length(reason_value) not between 5 and 2000 then raise exception 'A purpose of at least 5 characters is required.' using errcode='P0001'; end if;
  if nullif(trim(p_payload->>'event_name'),'') is null then raise exception 'Event name is required.' using errcode='P0001'; end if;
  if (p_payload->>'end_time')::time <= (p_payload->>'start_time')::time then raise exception 'End time must be after start time.' using errcode='P0001'; end if;
  if period_from not between 1 and 9 or period_to not between period_from and 9 then raise exception 'Select a valid period range from 1 to 9.' using errcode='P0001'; end if;
  if jsonb_array_length(p_payload->'faculty_ids') not between 1 and 3 then raise exception 'Select one to three faculty reviewers.' using errcode='P0001'; end if;
  if exists(select 1 from jsonb_array_elements_text(p_payload->'faculty_ids') x(value)
    left join public.profiles p on p.id=x.value::uuid and p.role='faculty' and p.is_active and p.department_id=actor.department_id where p.id is null)
    then raise exception 'One or more faculty reviewers are unavailable.' using errcode='P0001'; end if;
  if (select count(distinct value::uuid) from jsonb_array_elements_text(p_payload->'faculty_ids')) <> jsonb_array_length(p_payload->'faculty_ids') then raise exception 'Faculty reviewers must be unique.' using errcode='P0001'; end if;

  perform pg_advisory_xact_lock(hashtextextended(actor.id::text || ':' || year_id::text || ':' || category_value,0));
  select max_ods into limit_value from public.od_limits where department_id=actor.department_id and academic_year_id=year_id and category=category_value;
  if limit_value is null then limit_value := case category_value when 'Technical' then 5 else 3 end; end if;
  select count(*) into used_count from public.od_requests r
    where r.academic_year_id=year_id and r.od_category=category_value and r.status='APPROVED'
      and not coalesce(r.is_potential_duplicate,false) and not coalesce(r.is_special_od,false)
      and (r.requester_id=actor.id or exists(select 1 from public.od_request_students s where s.request_id=r.id and s.student_id=actor.id));
  if used_count < limit_value then raise exception 'Special OD is available only after the category limit is reached.' using errcode='P0001'; end if;

  select exists(select 1 from public.od_requests prior join public.od_request_students ps on ps.request_id=prior.id
    where prior.department_id=actor.department_id and prior.event_date=request_date and lower(prior.event_name)=lower(trim(p_payload->>'event_name'))
      and prior.status not in ('REJECTED_BY_FACULTY','REJECTED_BY_HOD','WITHDRAWN')
      and (p_payload->>'start_time')::time < coalesce(prior.end_time,'23:59:59'::time)
      and prior.start_time < (p_payload->>'end_time')::time and ps.student_id=actor.id) into duplicate_found;

  insert into public.od_requests(id,requester_id,department_id,academic_year_id,event_name,od_category,reason,event_type,organization,event_date,start_period,end_period,start_time,end_time,venue,purpose,requester_remarks,status,is_special_od,is_potential_duplicate,idempotency_key)
  values(new_id,actor.id,actor.department_id,year_id,trim(p_payload->>'event_name'),category_value,reason_value,category_value,
    nullif(trim(p_payload->>'organization'),''),request_date,period_from,period_to,(p_payload->>'start_time')::time,(p_payload->>'end_time')::time,
    trim(p_payload->>'venue'),reason_value,nullif(trim(p_payload->>'requester_remarks'),''),'PENDING_FACULTY',true,duplicate_found,(p_payload->>'idempotency_key')::uuid)
  on conflict(requester_id,idempotency_key) where idempotency_key is not null do nothing;
  if not found then select id into new_id from public.od_requests where requester_id=actor.id and idempotency_key=(p_payload->>'idempotency_key')::uuid; return jsonb_build_object('id',new_id,'potentialDuplicate',false); end if;
  insert into public.od_request_students(request_id,student_id) values(new_id,actor.id);
  insert into public.od_request_faculty(od_request_id,faculty_id) select new_id,value::uuid from jsonb_array_elements_text(p_payload->'faculty_ids') x(value);
  insert into public.od_approval_history(od_request_id,actor_id,actor_role,action,to_status) values(new_id,actor.id,'student','SPECIAL_OD_SUBMITTED','PENDING_FACULTY');
  insert into public.notifications(user_id,od_request_id,notification_type,title,message)
    select distinct target.user_id,new_id,'SPECIAL_OD_SUBMITTED','New Special OD requires your approval.','A new Special OD requires your approval.'
    from (select actor.id user_id union select value::uuid from jsonb_array_elements_text(p_payload->'faculty_ids') x(value)) target;
  return jsonb_build_object('id',new_id,'potentialDuplicate',duplicate_found);
end $$;
revoke all on function public.submit_special_od_request(jsonb) from public,anon;
grant execute on function public.submit_special_od_request(jsonb) to authenticated;

-- Normal decision RPCs cannot operate on flagged Special OD records.
create or replace function public.decide_od_request_faculty(p_request_id uuid,p_approved boolean,p_remarks text default null)
returns void language plpgsql security definer set search_path=public as $$
declare actor public.profiles := public.active_profile_or_error(); request_row public.od_requests; next_status public.od_status;
begin
  if actor.role<>'faculty' or (not p_approved and nullif(trim(p_remarks),'') is null) then raise exception 'FORBIDDEN' using errcode='P0001'; end if;
  select * into request_row from public.od_requests where id=p_request_id for update;
  if request_row.id is null or coalesce(request_row.is_special_od,false) or request_row.department_id<>actor.department_id or request_row.status<>'PENDING_FACULTY'
    or not exists(select 1 from public.od_request_faculty where od_request_id=p_request_id and faculty_id=actor.id and status='PENDING') then raise exception 'INVALID_STATUS_TRANSITION' using errcode='P0001'; end if;
  update public.od_request_faculty set status=case when p_approved then 'APPROVED'::public.faculty_approval_status else 'REJECTED'::public.faculty_approval_status end,remarks=nullif(trim(p_remarks),''),action_at=now(),updated_at=now() where od_request_id=p_request_id and faculty_id=actor.id;
  if not p_approved then next_status := 'REJECTED_BY_FACULTY'::public.od_status;
  elsif exists(select 1 from public.od_request_faculty where od_request_id=p_request_id and status='PENDING') then next_status := 'PENDING_FACULTY'::public.od_status;
  else next_status := 'PENDING_HOD'::public.od_status; end if;
  update public.od_requests set status=next_status,faculty_id=case when next_status='PENDING_HOD' then actor.id else faculty_id end,
    faculty_action_at=case when next_status<>'PENDING_FACULTY' then now() else faculty_action_at end,
    faculty_remarks=case when next_status<>'PENDING_FACULTY' then nullif(trim(p_remarks),'') else faculty_remarks end,
    faculty_rejection_reason=case when next_status='REJECTED_BY_FACULTY' then trim(p_remarks) else null end,updated_at=now() where id=p_request_id;
  insert into public.od_approval_history(od_request_id,actor_id,actor_role,action,from_status,to_status,remarks) values(p_request_id,actor.id,'faculty',case when p_approved then 'FACULTY_APPROVED' else 'FACULTY_REJECTED' end,'PENDING_FACULTY',next_status,p_remarks);
  if next_status<>'PENDING_FACULTY' then insert into public.notifications(user_id,od_request_id,notification_type,title,message)
    select distinct target.user_id,p_request_id,case when next_status='PENDING_HOD' then 'FACULTY_APPROVED' else 'FACULTY_REJECTED' end,
      case when next_status='PENDING_HOD' then 'Faculty approved OD request' else 'Faculty rejected OD request' end,
      coalesce(nullif(trim(p_remarks),''),case when next_status='PENDING_HOD' then 'Your OD request is pending HOD review.' else 'Your OD request was rejected by faculty.' end)
    from (select request_row.requester_id user_id union select student_id from public.od_request_students where request_id=p_request_id) target; end if;
  if next_status='PENDING_HOD' then insert into public.notifications(user_id,od_request_id,notification_type,title,message)
    select p.id,p_request_id,'OD_PENDING_HOD','OD request requires HOD review','A faculty-approved OD request is ready for HOD review.' from public.profiles p where p.role='hod' and p.is_active and p.department_id=actor.department_id; end if;
end $$;

create or replace function public.decide_od_request_hod(p_request_id uuid,p_approved boolean,p_remarks text default null)
returns void language plpgsql security definer set search_path=public as $$
declare actor public.profiles := public.active_profile_or_error(); request_row public.od_requests; next_status public.od_status;
begin
  if actor.role<>'hod' or (not p_approved and nullif(trim(p_remarks),'') is null) then raise exception 'FORBIDDEN' using errcode='P0001'; end if;
  select * into request_row from public.od_requests where id=p_request_id for update;
  if request_row.id is null or coalesce(request_row.is_special_od,false) or request_row.department_id<>actor.department_id or request_row.status<>'PENDING_HOD'
    or request_row.faculty_id is null or not exists(select 1 from public.od_request_faculty where od_request_id=p_request_id and faculty_id=request_row.faculty_id and status='APPROVED') then raise exception 'INVALID_STATUS_TRANSITION' using errcode='P0001'; end if;
  next_status := case when p_approved then 'APPROVED'::public.od_status else 'REJECTED_BY_HOD'::public.od_status end;
  update public.od_requests set status=next_status,hod_id=actor.id,hod_action_at=now(),hod_remarks=nullif(trim(p_remarks),''),hod_rejection_reason=case when p_approved then null else trim(p_remarks) end,updated_at=now() where id=p_request_id;
  insert into public.od_approval_history(od_request_id,actor_id,actor_role,action,from_status,to_status,remarks) values(p_request_id,actor.id,'hod',case when p_approved then 'HOD_APPROVED' else 'HOD_REJECTED' end,'PENDING_HOD',next_status,p_remarks);
  insert into public.notifications(user_id,od_request_id,notification_type,title,message)
    select distinct target.user_id,p_request_id,case when p_approved then 'HOD_APPROVED' else 'HOD_REJECTED' end,case when p_approved then 'OD request approved' else 'OD request rejected by HOD' end,
      coalesce(nullif(trim(p_remarks),''),case when p_approved then 'Your OD request has been approved.' else 'Your OD request was rejected by the HOD.' end)
    from (select request_row.requester_id user_id union select student_id from public.od_request_students where request_id=p_request_id union select faculty_id from public.od_request_faculty where od_request_id=p_request_id) target;
end $$;
revoke all on function public.decide_od_request_faculty(uuid,boolean,text),public.decide_od_request_hod(uuid,boolean,text) from public,anon;
grant execute on function public.decide_od_request_faculty(uuid,boolean,text),public.decide_od_request_hod(uuid,boolean,text) to authenticated;

create or replace function public.decide_special_od_faculty(p_request_id uuid,p_approved boolean,p_remarks text default null)
returns void language plpgsql security definer set search_path=public as $$
declare actor public.profiles := public.active_profile_or_error(); request_row public.od_requests; next_status public.od_status;
begin
  if actor.role<>'faculty' or (not p_approved and nullif(trim(p_remarks),'') is null) then raise exception 'FORBIDDEN' using errcode='P0001'; end if;
  select * into request_row from public.od_requests where id=p_request_id for update;
  if request_row.id is null or not request_row.is_special_od or request_row.department_id<>actor.department_id or request_row.status<>'PENDING_FACULTY'
    or not exists(select 1 from public.od_request_faculty where od_request_id=p_request_id and faculty_id=actor.id and status='PENDING') then raise exception 'INVALID_STATUS_TRANSITION' using errcode='P0001'; end if;
  update public.od_request_faculty set status=case when p_approved then 'APPROVED'::public.faculty_approval_status else 'REJECTED'::public.faculty_approval_status end,remarks=nullif(trim(p_remarks),''),action_at=now(),updated_at=now() where od_request_id=p_request_id and faculty_id=actor.id;
  if not p_approved then next_status := 'REJECTED_BY_FACULTY'::public.od_status;
  elsif exists(select 1 from public.od_request_faculty where od_request_id=p_request_id and status='PENDING') then next_status := 'PENDING_FACULTY'::public.od_status;
  else next_status := 'PENDING_HOD'::public.od_status; end if;
  update public.od_requests set status=next_status,faculty_id=case when next_status='PENDING_HOD' then actor.id else faculty_id end,
    faculty_action_at=now(),faculty_remarks=nullif(trim(p_remarks),''),faculty_rejection_reason=case when next_status='REJECTED_BY_FACULTY' then trim(p_remarks) else null end,updated_at=now() where id=p_request_id;
  insert into public.od_approval_history(od_request_id,actor_id,actor_role,action,from_status,to_status,remarks)
    values(p_request_id,actor.id,'faculty',case when p_approved then 'FACULTY_APPROVED' else 'FACULTY_REJECTED' end,'PENDING_FACULTY',next_status,p_remarks);
  if next_status='REJECTED_BY_FACULTY' then
    insert into public.notifications(user_id,od_request_id,notification_type,title,message) values(request_row.requester_id,p_request_id,'FACULTY_REJECTED','Your Special OD was rejected by Faculty.','Your Special OD was rejected by Faculty. '||coalesce(nullif(trim(p_remarks),''),''));
  elsif next_status='PENDING_HOD' then
    insert into public.notifications(user_id,od_request_id,notification_type,title,message) values(request_row.requester_id,p_request_id,'FACULTY_APPROVED','Your Special OD was approved by Faculty and forwarded to HOD.','Your Special OD was approved by Faculty and forwarded to HOD.');
    insert into public.notifications(user_id,od_request_id,notification_type,title,message)
      select p.id,p_request_id,'SPECIAL_OD_PENDING_HOD','New Special OD requires HOD approval.','A Faculty-approved Special OD is awaiting your review.' from public.profiles p where p.role='hod' and p.is_active and p.department_id=request_row.department_id;
  end if;
end $$;
revoke all on function public.decide_special_od_faculty(uuid,boolean,text) from public,anon;
grant execute on function public.decide_special_od_faculty(uuid,boolean,text) to authenticated;

create or replace function public.decide_special_od_hod(p_request_id uuid,p_approved boolean,p_remarks text default null)
returns void language plpgsql security definer set search_path=public as $$
declare actor public.profiles := public.active_profile_or_error(); request_row public.od_requests; next_status public.od_status;
begin
  if actor.role<>'hod' or (not p_approved and nullif(trim(p_remarks),'') is null) then raise exception 'FORBIDDEN' using errcode='P0001'; end if;
  select * into request_row from public.od_requests where id=p_request_id for update;
  if request_row.id is null or not request_row.is_special_od or request_row.department_id<>actor.department_id or request_row.status<>'PENDING_HOD'
    or not exists(select 1 from public.od_request_faculty where od_request_id=p_request_id)
    or exists(select 1 from public.od_request_faculty where od_request_id=p_request_id and status<>'APPROVED') then raise exception 'INVALID_STATUS_TRANSITION' using errcode='P0001'; end if;
  next_status := case when p_approved then 'APPROVED'::public.od_status else 'REJECTED_BY_HOD'::public.od_status end;
  update public.od_requests set status=next_status,hod_id=actor.id,hod_action_at=now(),hod_remarks=nullif(trim(p_remarks),''),hod_rejection_reason=case when p_approved then null else trim(p_remarks) end,updated_at=now() where id=p_request_id;
  insert into public.od_approval_history(od_request_id,actor_id,actor_role,action,from_status,to_status,remarks)
    values(p_request_id,actor.id,'hod',case when p_approved then 'SPECIAL_OD_HOD_APPROVED' else 'SPECIAL_OD_HOD_REJECTED' end,'PENDING_HOD',next_status,p_remarks);
  insert into public.notifications(user_id,od_request_id,notification_type,title,message)
    values(request_row.requester_id,p_request_id,case when p_approved then 'SPECIAL_OD_HOD_APPROVED' else 'SPECIAL_OD_HOD_REJECTED' end,
      case when p_approved then 'Your Special OD was approved by HOD.' else 'Your Special OD was rejected by HOD.' end,
      case when p_approved then 'Your Special OD was approved by HOD.' else 'Your Special OD was rejected by HOD. '||coalesce(nullif(trim(p_remarks),''),'') end);
end $$;
revoke all on function public.decide_special_od_hod(uuid,boolean,text) from public,anon;
grant execute on function public.decide_special_od_hod(uuid,boolean,text) to authenticated;

notify pgrst,'reload schema';

