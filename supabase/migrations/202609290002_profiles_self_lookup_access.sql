-- Ensure an authenticated user can resolve only their own existing profile.
-- Preserve the policy when the exact self-read rule is already present.
do $$
declare policy_qual text;
begin
  select qual into policy_qual
  from pg_policies
  where schemaname = 'public'
    and tablename = 'profiles'
    and policyname = 'profiles_auth_user_read_own'
    and cmd = 'SELECT'
    and 'authenticated' = any(roles);

  if policy_qual is null or replace(lower(policy_qual), ' ', '') not like '%auth.uid()=auth_user_id%' then
    drop policy if exists "profiles_auth_user_read_own" on public.profiles;
    create policy "profiles_auth_user_read_own"
      on public.profiles
      for select
      to authenticated
      using (auth.uid() = auth_user_id);
  end if;
end $$;

grant select on public.profiles to authenticated;
