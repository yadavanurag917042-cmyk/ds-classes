-- Run once in the Supabase SQL Editor to enable bounded phone/password login attempts.
create table if not exists public.phone_login_rate_limits (
  phone_hash text primary key check (phone_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 0 check (attempt_count >= 0)
);

create index if not exists phone_login_rate_limits_window_idx
  on public.phone_login_rate_limits (window_started_at);

alter table public.phone_login_rate_limits enable row level security;
revoke all on public.phone_login_rate_limits from public, anon, authenticated;

create or replace function public.check_phone_login_rate_limit(
  p_phone_hash text,
  p_action text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_started_at timestamptz;
  existing_attempt_count integer;
  updated_attempt_count integer;
begin
  if p_phone_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid phone login key';
  end if;

  if p_action = 'success' then
    delete from public.phone_login_rate_limits where phone_hash = p_phone_hash;
    return true;
  end if;

  if p_action = 'check' then
    select window_started_at, attempt_count
      into existing_started_at, existing_attempt_count
      from public.phone_login_rate_limits
      where phone_hash = p_phone_hash;

    if not found or existing_started_at <= now() - interval '15 minutes' then
      delete from public.phone_login_rate_limits where phone_hash = p_phone_hash;
      return true;
    end if;
    return existing_attempt_count < 5;
  end if;

  if p_action != 'failure' then
    raise exception 'Invalid phone login action';
  end if;

  insert into public.phone_login_rate_limits as current_limit (phone_hash, window_started_at, attempt_count)
    values (p_phone_hash, now(), 1)
    on conflict (phone_hash) do update
      set window_started_at = case
            when current_limit.window_started_at <= now() - interval '15 minutes' then now()
            else current_limit.window_started_at
          end,
          attempt_count = case
            when current_limit.window_started_at <= now() - interval '15 minutes' then 1
            else current_limit.attempt_count + 1
          end
    returning attempt_count into updated_attempt_count;

  delete from public.phone_login_rate_limits
    where window_started_at <= now() - interval '24 hours';

  return updated_attempt_count < 5;
end;
$$;

revoke all on function public.check_phone_login_rate_limit(text, text) from public, anon, authenticated;
grant execute on function public.check_phone_login_rate_limit(text, text) to service_role;
