-- Pending staff setup is authorized by the Admin-created invitation, not by a
-- profiles row. Keep the setup form usable if the Auth provisioning trigger
-- failed to create that row.
alter table public.staff_account_invitations
  add column if not exists completed_at timestamptz;

-- Rebuild/finish the profile only for the currently authenticated, verified
-- user bound to a live invitation. Role and department come exclusively from
-- the invitation row; no client parameter can select either value.
create or replace function public.complete_staff_account_setup(
  p_full_name text,
  p_faculty_id text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor_id uuid := auth.uid();
  actor_email text;
  invitation public.staff_account_invitations%rowtype;
  department_row public.departments%rowtype;
  actor public.profiles%rowtype;
  staff_id text := upper(trim(coalesce(p_faculty_id, '')));
  staff_name text := trim(coalesce(p_full_name, ''));
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select lower(email) into actor_email
  from auth.users
  where id = actor_id and email_confirmed_at is not null;
  if actor_email is null or lower(split_part(actor_email, '@', 2)) <> 'srmist.edu.in' then
    raise exception 'A verified SRMIST email is required.' using errcode = '42501';
  end if;

  select * into invitation
  from public.staff_account_invitations
  where email = actor_email
    and auth_user_id = actor_id
    and claimed_at is not null
    and completed_at is null
    and expires_at > now()
    and role in ('faculty', 'hod')
  for update;
  if invitation.id is null then
    raise exception 'No pending staff invitation was found for this account.' using errcode = '42501';
  end if;

  select * into department_row
  from public.departments
  where id = invitation.department_id and code = 'ECE' and is_active = true;
  if department_row.id is null then
    raise exception 'The invited ECE department is not active.' using errcode = '23503';
  end if;
  if length(staff_name) not between 2 and 120 or staff_id !~ '^RA[A-Z0-9]{6,18}$' then
    raise exception 'Enter a valid name and Faculty ID.' using errcode = '23514';
  end if;

  select * into actor from public.profiles where auth_user_id = actor_id for update;
  if actor.id is null then
    insert into public.profiles (
      auth_user_id, full_name, email, register_number, department_id, role,
      is_admin_access, is_active, must_change_password, staff_setup_pending,
      created_at, updated_at
    ) values (
      actor_id, staff_name, actor_email, staff_id, invitation.department_id,
      invitation.role, false, true, false, false, now(), now()
    );
  else
    if actor.email <> actor_email
       or actor.role <> invitation.role
       or actor.department_id <> invitation.department_id
       or actor.staff_setup_pending is distinct from true then
      raise exception 'The existing profile does not match this pending invitation.' using errcode = '42501';
    end if;
    update public.profiles
    set full_name = staff_name,
        register_number = staff_id,
        is_active = true,
        must_change_password = false,
        staff_setup_pending = false,
        updated_at = now()
    where id = actor.id;
  end if;

  update public.staff_account_invitations
  set completed_at = now()
  where id = invitation.id;
end;
$$;

revoke all on function public.complete_staff_account_setup(text, text) from public, anon;
grant execute on function public.complete_staff_account_setup(text, text) to authenticated;
