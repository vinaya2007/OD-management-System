-- Permit an Admin to restart an incomplete staff invite after its Auth user
-- has been removed. This only reuses an existing inactive, pending profile
-- with the exact role and department in the protected invitation record.
create or replace function public.provision_student_profile_for_auth_user()
returns trigger language plpgsql security definer set search_path=public,auth as $$
declare
  department_row public.departments%rowtype;
  invitation public.staff_account_invitations%rowtype;
  profile_name text;
  register_no text;
  section_value text;
  year_value text;
  department_code text;
  provisioned_profile_id uuid;
begin
  if new.email is null or lower(split_part(new.email,'@',2)) <> 'srmist.edu.in' then
    raise exception 'Only @srmist.edu.in accounts can use this application.' using errcode='23514';
  end if;

  select * into invitation from public.staff_account_invitations
   where email=lower(new.email) and auth_user_id is null and claimed_at is null and expires_at>now()
   for update;
  if invitation.id is not null then
    select * into department_row from public.departments where id=invitation.department_id and is_active=true;
    if department_row.id is null or department_row.code <> 'ECE' then
      raise exception 'The invited ECE department is not active.' using errcode='23503';
    end if;
    insert into public.profiles(auth_user_id,full_name,email,role,department_id,is_active,must_change_password,staff_setup_pending)
    values(new.id,split_part(new.email,'@',1),lower(new.email),invitation.role,invitation.department_id,false,false,true)
    on conflict(email) do update set auth_user_id=excluded.auth_user_id,role=excluded.role,
      department_id=excluded.department_id,is_active=false,must_change_password=false,
      staff_setup_pending=true,updated_at=now()
    where public.profiles.staff_setup_pending=true
      and public.profiles.role=excluded.role
      and public.profiles.department_id=excluded.department_id
    returning id into provisioned_profile_id;
    if provisioned_profile_id is null then
      raise exception 'This email is already linked to a non-pending profile.' using errcode='23505';
    end if;
    update public.staff_account_invitations set auth_user_id=new.id,claimed_at=now() where id=invitation.id;
    return new;
  end if;

  profile_name := nullif(trim(coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name')),'');
  register_no := upper(trim(coalesce(new.raw_user_meta_data->>'register_number','')));
  section_value := upper(trim(coalesce(new.raw_user_meta_data->>'section','')));
  year_value := upper(trim(coalesce(new.raw_user_meta_data->>'year','')));
  department_code := upper(trim(coalesce(new.raw_user_meta_data->>'department_code','')));
  if profile_name is null or length(profile_name) not between 2 and 120
    or register_no !~ '^RA[A-Z0-9]{6,18}$' or section_value not in ('A','B')
    or year_value not in ('I','II','III','IV') or department_code <> 'ECE' then
    raise exception 'Required student registration details are invalid.' using errcode='23514';
  end if;
  select * into department_row from public.departments where code=department_code and is_active=true limit 1;
  if department_row.id is null then raise exception 'The ECE department is not active.' using errcode='23503'; end if;
  insert into public.profiles(auth_user_id,full_name,email,role,department_id,register_number,section,year,is_active)
  values(new.id,profile_name,lower(new.email),'student'::public.user_role,department_row.id,register_no,section_value,year_value,true);
  return new;
end $$;
revoke all on function public.provision_student_profile_for_auth_user() from public,anon,authenticated;
