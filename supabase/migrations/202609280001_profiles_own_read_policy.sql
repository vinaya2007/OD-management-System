-- The provisioned schema enables RLS before policies are added separately.
-- Permit an authenticated user to resolve only their own app profile, keyed
-- by the auth.users relationship (profiles.auth_user_id).
drop policy if exists "profiles_auth_user_read_own" on public.profiles;
create policy "profiles_auth_user_read_own"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = auth_user_id);
