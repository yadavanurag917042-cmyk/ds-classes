-- Replace the email with the exact, verified email in Supabase Auth > Users.
-- Run in the Supabase SQL Editor, then sign out and sign in again to refresh the JWT.
do $$
declare
  admin_email text := lower(btrim('yadavanurag917042@gmail.com'));
  promoted_user_id uuid;
begin
  if admin_email = '' or admin_email = 'REPLACE_WITH_ADMIN_EMAIL' then
    raise exception 'Set admin_email to the exact verified email from Supabase Auth > Users before running this script.';
  end if;

  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
  where lower(btrim(email)) = admin_email
  returning id into promoted_user_id;

  if promoted_user_id is null then
    raise exception 'No Supabase Auth user found for the supplied email. Check the exact email in Auth > Users; no admin role was assigned.';
  end if;

  raise notice 'Admin role assigned to Supabase user %. Sign out and sign in again to receive a fresh JWT.', promoted_user_id;
end
$$;
