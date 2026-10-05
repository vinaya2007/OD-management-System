-- Provision student profiles transactionally with Auth signup using the existing
-- profiles and departments tables. No frontend role or profile-completion flow.
create or replace function public.provision_student_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  department_row public.departments%rowtype;
  profile_name text;
  register_no text;
  section_value text;
  year_value text;
  department_code text;
begin
  if new.email is null or lower(split_part(new.email, '@', 2)) <> 'srmist.edu.in' then
    raise exception 'Only @srmist.edu.in accounts can use this application.' using errcode = '23514';
  end if;

  profile_name := nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')), '');
  register_no := upper(trim(coalesce(new.raw_user_meta_data->>'register_number', '')));
  section_value := upper(trim(coalesce(new.raw_user_meta_data->>'section', '')));
  year_value := upper(trim(coalesce(new.raw_user_meta_data->>'year', '')));
  department_code := upper(trim(coalesce(new.raw_user_meta_data->>'department_code', '')));

  if profile_name is null or length(profile_name) not between 2 and 120
    or register_no !~ '^RA[A-Z0-9]{6,18}$'
    or section_value not in ('A', 'B')
    or year_value not in ('I', 'II', 'III', 'IV')
    or department_code <> 'ECE' then
    raise exception 'Required student registration details are invalid.' using errcode = '23514';
  end if;

  select * into department_row from public.departments
  where code = department_code and is_active = true
  limit 1;
  if department_row.id is null then
    raise exception 'The ECE department is not active.' using errcode = '23503';
  end if;

  insert into public.profiles
    (auth_user_id, full_name, email, role, department_id, register_number, section, year, is_active)
  values
    (new.id, profile_name, lower(new.email), 'student'::public.user_role,
     department_row.id, register_no, section_value, year_value, true)
  on conflict (auth_user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.provision_student_profile_for_auth_user() from public, anon, authenticated;
drop trigger if exists auth_user_provision_student_profile on auth.users;
create trigger auth_user_provision_student_profile
  after insert on auth.users
  for each row execute function public.provision_student_profile_for_auth_user();

-- The Auth trigger replaces the old post-registration completion RPC.
drop function if exists public.complete_student_profile(text, text, text);
