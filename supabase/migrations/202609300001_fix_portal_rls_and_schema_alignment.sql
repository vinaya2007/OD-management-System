-- Reconcile legacy RLS policies with the final request_id schema and break the
-- od_requests <-> od_request_students RLS dependency cycle. Safe to reapply.

-- These helpers perform their own caller, role, department, status, and
-- participant checks. row_security=off applies only inside the SECURITY DEFINER
-- helpers so reads of protected tables cannot re-enter the policy invoking them.
alter function public.can_access_od_request(uuid) set row_security = off;
alter function public.can_view_profile(uuid) set row_security = off;
alter function public.can_view_od_attendance(uuid, uuid) set row_security = off;

-- Remove every legacy SELECT/WRITE policy on workflow data tables. Application
-- writes go through the validated SECURITY DEFINER RPCs only.
do $$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('od_requests','od_request_students','od_request_faculty','od_approval_history','od_attendance','notifications')
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;

  -- Replace earlier profile SELECT policies while preserving any deliberate
  -- admin update policy.
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and cmd = 'SELECT'
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

alter table public.od_requests enable row level security;
alter table public.od_request_students enable row level security;
alter table public.od_request_faculty enable row level security;
alter table public.od_approval_history enable row level security;
alter table public.od_attendance enable row level security;
alter table public.notifications enable row level security;
alter table public.profiles enable row level security;

-- A user sees their own profile and profile details needed for a shared OD.
create policy "profiles own auth user read"
  on public.profiles for select to authenticated
  using (auth.uid() = auth_user_id);
create policy "profiles related users read"
  on public.profiles for select to authenticated
  using (public.can_view_profile(id));

create policy "od requests scoped read"
  on public.od_requests for select to authenticated
  using (public.can_access_od_request(id));
create policy "od request students scoped read"
  on public.od_request_students for select to authenticated
  using (public.can_access_od_request(request_id));
create policy "od request faculty scoped read"
  on public.od_request_faculty for select to authenticated
  using (public.can_access_od_request(od_request_id));
create policy "od approval history scoped read"
  on public.od_approval_history for select to authenticated
  using (public.can_access_od_request(od_request_id));
create policy "od attendance scoped read"
  on public.od_attendance for select to authenticated
  using (public.can_view_od_attendance(request_id, student_id));
create policy "notifications own read"
  on public.notifications for select to authenticated
  using (user_id = (public.current_profile()).id);

-- Prevent client-side writes to protected workflow state. RPCs remain the only
-- authenticated write path; service_role retains its server-side privileges.
revoke insert, update, delete on public.od_requests, public.od_request_students,
  public.od_request_faculty, public.od_approval_history, public.od_attendance,
  public.notifications from anon, authenticated;
grant select on public.od_requests, public.od_request_students,
  public.od_request_faculty, public.od_approval_history,
  public.od_attendance, public.notifications to authenticated;

-- Keep email private to the account owner/Auth and the server-side admin client.
-- The auth helper selects only these profile fields and merges the email from
-- the verified Supabase Auth user object.
revoke select on public.profiles from anon, authenticated;
grant select (id, auth_user_id, full_name, role, department_id, register_number,
  year, section, designation, is_active, must_change_password, created_at, updated_at)
  on public.profiles to authenticated;

-- Public registration metadata remains limited to active departments.
revoke select on public.departments from anon, authenticated;
grant select (id, name, code, is_active) on public.departments to anon, authenticated;
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname='public' and tablename='departments' and cmd='SELECT'
  loop
    execute format('drop policy if exists %I on public.departments', p.policyname);
  end loop;
end $$;
create policy "active departments registration read"
  on public.departments for select to anon, authenticated
  using (is_active);
-- Align late compatibility columns with the deployed base schema without losing data.
-- The base attendance column is `status`; the latest RPC/API use `attendance_status`.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='od_attendance' and column_name='status')
     and not exists (select 1 from information_schema.columns where table_schema='public' and table_name='od_attendance' and column_name='attendance_status') then
    alter table public.od_attendance rename column status to attendance_status;
  elsif exists (select 1 from information_schema.columns where table_schema='public' and table_name='od_attendance' and column_name='status') then
    update public.od_attendance set attendance_status = status
      where attendance_status is null or (attendance_status = 'NOT_MARKED' and status <> 'NOT_MARKED');
  else
    alter table public.od_attendance add column if not exists attendance_status public.attendance_status not null default 'NOT_MARKED';
  end if;
end $$;

-- Preserve existing notification values when moving to the canonical fields.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='notifications' and column_name='type') then
    update public.notifications set notification_type = coalesce(notification_type, type);
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='notifications' and column_name='reference_id') then
    update public.notifications set od_request_id = coalesce(od_request_id, reference_id);
  end if;
end $$;
-- Carry historical names/status into the latest RPC/API columns added by the
-- hardening migration. Existing values take precedence and no rows are removed.
update public.od_requests set
  event_type = coalesce(event_type, od_category),
  purpose = coalesce(purpose, reason),
  faculty_id = coalesce(faculty_id, faculty_decision_by),
  faculty_action_at = coalesce(faculty_action_at, faculty_decision_at),
  hod_id = coalesce(hod_id, hod_decision_by),
  hod_action_at = coalesce(hod_action_at, hod_decision_at)
where event_type is null or purpose is null
   or faculty_id is null or faculty_action_at is null
   or hod_id is null or hod_action_at is null;

notify pgrst, 'reload schema';
