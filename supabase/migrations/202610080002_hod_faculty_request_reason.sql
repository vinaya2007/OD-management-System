-- A non-empty reason is sufficient for HOD Faculty account requests.
-- Keep the existing request table and authenticated server-side workflow.
alter table public.faculty_role_requests
  drop constraint if exists faculty_role_requests_reason_check,
  drop constraint if exists faculty_role_requests_reason_nonempty_check;

alter table public.faculty_role_requests
  add constraint faculty_role_requests_reason_nonempty_check
  check (length(trim(reason)) between 1 and 2000);

create or replace function public.submit_faculty_role_request(p_email text, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
set row_security = off
as $$
declare
  actor public.profiles;
  requested_email text := lower(trim(coalesce(p_email, '')));
  request_reason text := trim(coalesce(p_reason, ''));
  request_id uuid;
begin
  actor := public.active_profile_or_error();
  if actor.role <> 'hod' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if actor.department_id is null then raise exception 'HOD_DEPARTMENT_REQUIRED' using errcode = 'P0001'; end if;
  if length(requested_email) > 254 or requested_email !~ '^[^[:space:]@]+@srmist[.]edu[.]in$' then
    raise exception 'INVALID_SRMIST_EMAIL' using errcode = 'P0001';
  end if;
  if length(request_reason) < 1 or length(request_reason) > 2000 then
    raise exception 'INVALID_REQUEST_REASON' using errcode = 'P0001';
  end if;

  -- Prevent concurrent duplicate requests from racing past the pending check.
  perform pg_advisory_xact_lock(hashtext(actor.id::text), hashtext(requested_email));
  if exists (select 1 from public.profiles p where lower(p.email) = requested_email and p.role = 'faculty') then
    raise exception 'FACULTY_ACCOUNT_EXISTS' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.faculty_role_requests r where r.requester_id = actor.id
             and lower(r.email) = requested_email and r.status = 'PENDING') then
    raise exception 'FACULTY_REQUEST_ALREADY_PENDING' using errcode = 'P0001';
  end if;

  insert into public.faculty_role_requests(requester_id, email, department_id, reason)
  values (actor.id, requested_email, actor.department_id, request_reason)
  returning id into request_id;

  insert into public.notifications(user_id, notification_type, title, message)
  select p.id, 'FACULTY_ROLE_REQUEST', 'Faculty account request',
         format('%s requested a Faculty account for %s. Review it in User Management.', actor.full_name, requested_email)
  from public.profiles p
  where p.role = 'admin' and p.is_active;

  return request_id;
end;
$$;

revoke all on function public.submit_faculty_role_request(text, text) from public, anon;
grant execute on function public.submit_faculty_role_request(text, text) to authenticated;
