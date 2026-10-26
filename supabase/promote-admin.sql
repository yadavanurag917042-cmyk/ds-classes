-- Replace the email after the admin has registered and verified it.
-- Run this once in the Supabase SQL Editor, then have the admin sign in again.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
where email = 'REPLACE_WITH_ADMIN_EMAIL';
