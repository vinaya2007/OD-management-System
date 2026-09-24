-- Security and workflow corrections discovered during production audit.

-- These lookups are used by RLS policies on profiles itself. Definer rights
-- prevent recursive RLS evaluation while still binding all lookups to auth.uid().
create or replace function current_profile()
returns profiles language sql stable security definer set search_path = public as $$
  select * from public.profiles where auth_user_id = auth.uid() and is_active = true limit 1
$$;
create or replace function current_role()
returns user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where auth_user_id = auth.uid() and is_active = true limit 1
$$;

drop policy if exists "scoped profile visibility" on profiles;
create policy "scoped profile visibility" on profiles for select using (
  auth.uid() = auth_user_id
  or current_role() = 'admin'
  or (current_role() in ('faculty', 'hod') and department_id = (current_profile()).department_id)
  or (current_role() = 'student' and role = 'faculty' and is_active and department_id = (current_profile()).department_id)
);

drop policy if exists "approval visibility" on od_faculty_approvals;
create policy "approval visibility" on od_faculty_approvals for select using (
  faculty_id = (current_profile()).id
  or current_role() = 'admin'
  or (current_role() = 'hod' and exists (
    select 1 from od_applications od
    where od.id = od_faculty_approvals.od_id and od.department_id = (current_profile()).department_id
  ))
  or exists (select 1 from od_applications od where od.id = od_faculty_approvals.od_id and od.student_id = (current_profile()).id)
);

drop policy if exists "users read limits" on od_limits;
create policy "authenticated users read limits" on od_limits for select using (auth.uid() is not null);
drop policy if exists "users read workflow settings" on workflow_settings;
create policy "scoped workflow settings visibility" on workflow_settings for select using (
  current_role() = 'admin' or department_id = (current_profile()).department_id
);

drop policy if exists "special permissions visibility" on special_permissions;
create policy "special permissions visibility" on special_permissions for select using (
  requested_by = (current_profile()).id
  or approver_id = (current_profile()).id
  or current_role() = 'admin'
  or (current_role() = 'hod' and exists (
    select 1 from od_applications od
    where od.id = special_permissions.od_id and od.department_id = (current_profile()).department_id
  ))
);

-- A special request is permitted only after the approved-OD category limit is met.
create or replace function enforce_special_od_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare category_limit integer; approved_count integer;
begin
  select limit_count into category_limit from od_limits
    where academic_year_id = new.academic_year_id and category = new.category and is_active limit 1;
  select count(*) into approved_count from od_applications
    where student_id = new.student_id and academic_year_id = new.academic_year_id and category = new.category and status = 'APPROVED';
  if category_limit is not null and approved_count >= category_limit and not new.is_special then
    raise exception 'OD_LIMIT_REACHED' using errcode = 'P0001';
  end if;
  if new.is_special and (category_limit is null or approved_count < category_limit) then
    raise exception 'SPECIAL_PERMISSION_NOT_REQUIRED' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists enforce_special_od_limit_before_insert on od_applications;
create trigger enforce_special_od_limit_before_insert before insert on od_applications
for each row execute function enforce_special_od_limit();

revoke all on function submit_od_application(jsonb) from public, anon;
revoke all on function decide_faculty_od(uuid, faculty_approval_status, text) from public, anon;
revoke all on function decide_hod_od(uuid, boolean, text) from public, anon;
revoke all on function replace_pending_faculty(uuid, uuid, uuid) from public, anon;
revoke all on function withdraw_od(uuid) from public, anon;
revoke all on function active_profile_or_error() from public, anon;
revoke all on function active_academic_year_or_error() from public, anon;
grant execute on function current_profile(), current_role(), submit_od_application(jsonb), decide_faculty_od(uuid, faculty_approval_status, text), decide_hod_od(uuid, boolean, text), replace_pending_faculty(uuid, uuid, uuid), withdraw_od(uuid) to authenticated;

create or replace function decide_hod_od(p_od_id uuid, p_approved boolean, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
declare profile_row profiles := active_profile_or_error(); application od_applications;
begin
  if profile_row.role not in ('hod', 'admin') or (not p_approved and nullif(trim(p_comment), '') is null) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into application from od_applications where id = p_od_id for update;
  if application.id is null or application.department_id is distinct from profile_row.department_id or application.status <> 'HOD_REVIEW'
    or exists (select 1 from od_faculty_approvals where od_id = p_od_id and status <> 'APPROVED')
    or (application.is_special and application.special_permission_status <> 'APPROVED') then
    raise exception 'INVALID_STATUS_TRANSITION' using errcode = 'P0001';
  end if;
  update od_applications set status = case when p_approved then 'APPROVED'::od_status else 'REJECTED'::od_status end where id = p_od_id;
  insert into notifications (user_id, od_id, type, title, message) values (application.student_id, p_od_id, case when p_approved then 'HOD_APPROVED' else 'HOD_REJECTED' end, case when p_approved then 'OD approved' else 'OD rejected' end, coalesce(nullif(trim(p_comment), ''), case when p_approved then 'Your OD has been approved by the HOD.' else 'Your OD has been rejected by the HOD.' end));
  insert into audit_logs (actor_id, od_id, action, metadata) values (profile_row.id, p_od_id, case when p_approved then 'HOD_APPROVED' else 'HOD_REJECTED' end, jsonb_build_object('comment', p_comment));
end $$;

create or replace function decide_special_permission(p_od_id uuid, p_approved boolean, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
declare profile_row profiles := active_profile_or_error(); application od_applications; permission_row special_permissions;
begin
  select * into application from od_applications where id = p_od_id for update;
  select * into permission_row from special_permissions where od_id = p_od_id for update;
  if application.id is null or permission_row.id is null
    or (profile_row.role <> 'admin' and application.department_id is distinct from profile_row.department_id)
    or profile_row.role not in ('hod', 'admin') or permission_row.status <> 'PENDING'
    or application.status not in ('FACULTY_REVIEW', 'CORRECTION_REQUESTED', 'HOD_REVIEW')
    or (permission_row.approver_id is not null and permission_row.approver_id <> profile_row.id)
    or (not p_approved and nullif(trim(p_comment), '') is null) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  update special_permissions set status = case when p_approved then 'APPROVED'::special_permission_status else 'REJECTED'::special_permission_status end,
    approver_id = profile_row.id, approver_comment = nullif(trim(p_comment), ''), approved_at = case when p_approved then now() else null end
    where id = permission_row.id;
  update od_applications set special_permission_status = case when p_approved then 'APPROVED'::special_permission_status else 'REJECTED'::special_permission_status end where id = p_od_id;
  if not p_approved then update od_applications set status = 'REJECTED' where id = p_od_id; end if;
  insert into notifications (user_id, od_id, type, title, message) values (application.student_id, p_od_id,
    case when p_approved then 'SPECIAL_PERMISSION_APPROVED' else 'SPECIAL_PERMISSION_REJECTED' end,
    case when p_approved then 'Special permission approved' else 'Special permission rejected' end,
    coalesce(nullif(trim(p_comment), ''), case when p_approved then 'Your special permission request was approved.' else 'Your special permission request was rejected.' end));
  insert into audit_logs (actor_id, od_id, action) values (profile_row.id, p_od_id, case when p_approved then 'SPECIAL_PERMISSION_APPROVED' else 'SPECIAL_PERMISSION_REJECTED' end);
end $$;

create or replace function mark_notification_read(p_notification_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare profile_row profiles := active_profile_or_error();
begin
  update notifications set is_read = true where user_id = profile_row.id and (p_notification_id is null or id = p_notification_id);
  if p_notification_id is not null and not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
end $$;
revoke all on function decide_special_permission(uuid, boolean, text), mark_notification_read(uuid) from public, anon;
revoke all on function enforce_special_od_limit() from public, anon;
grant execute on function decide_hod_od(uuid, boolean, text), decide_special_permission(uuid, boolean, text), mark_notification_read(uuid) to authenticated;
