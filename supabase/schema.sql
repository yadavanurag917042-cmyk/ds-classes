-- Run this file once in the Supabase SQL Editor.
create extension if not exists pgcrypto;

create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  -- The JWT's top-level role is normally "authenticated"; admin is app_metadata.role.
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

create table if not exists public.batches (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  class_name text not null check (char_length(class_name) between 1 and 80),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 120),
  email text,
  phone text not null default '',
  address text not null default '',
  avatar_path text,
  batch_id uuid references public.batches(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.profiles alter column email drop not null;
alter table public.profiles add column if not exists is_active boolean not null default true;
alter table public.profiles add column if not exists previous_banned_until timestamptz;

create or replace function public.current_batch_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.batch_id from public.profiles p where p.id = auth.uid() and p.is_active;
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin() or coalesce(
    (select p.is_active from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.batches(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  body text not null check (char_length(body) between 1 and 5000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.study_materials (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.batches(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  subject text not null check (char_length(subject) between 1 and 100),
  storage_path text not null unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.batches(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  subject text not null check (char_length(subject) between 1 and 100),
  stream_url text check (stream_url is null or stream_url like 'https://%'),
  recording_url text check (recording_url is null or recording_url like 'https://%'),
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'ended')),
  starts_at timestamptz not null default now(),
  ended_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  author_avatar_path text,
  body text not null default '' check (char_length(body) <= 500),
  image_path text,
  created_at timestamptz not null default now(),
  constraint community_post_has_content check (body <> '' or image_path is not null)
);

create table if not exists public.live_chat (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  batch_id uuid not null references public.batches(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  batch_id uuid not null references public.batches(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create table if not exists public.inbox_threads (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  subject text not null check (char_length(subject) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inbox_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists profiles_batch_id_idx on public.profiles(batch_id);
create index if not exists notices_batch_created_idx on public.notices(batch_id, created_at desc);
create index if not exists materials_batch_created_idx on public.study_materials(batch_id, created_at desc);
create index if not exists live_sessions_batch_status_idx on public.live_sessions(batch_id, status);
create index if not exists community_posts_batch_created_idx on public.community_posts(batch_id, created_at desc);
create index if not exists live_chat_session_created_idx on public.live_chat(session_id, created_at);
create index if not exists community_comments_post_created_idx on public.community_comments(post_id, created_at);
create index if not exists inbox_threads_student_updated_idx on public.inbox_threads(student_id, updated_at desc);
create index if not exists inbox_messages_thread_created_idx on public.inbox_messages(thread_id, created_at);

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email, phone, address)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 'Student'),
    new.email,
    coalesce(new.raw_user_meta_data ->> 'phone', new.phone, ''),
    coalesce(new.raw_user_meta_data ->> 'address', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_ds_classes on auth.users;
create trigger on_auth_user_created_ds_classes
after insert on auth.users
for each row execute function public.create_profile_for_new_user();

create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.avatar_path is distinct from old.avatar_path and new.avatar_path is not null and (
    (storage.foldername(new.avatar_path))[1] <> new.id::text
    or not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'student-avatars'
        and o.name = new.avatar_path
        and (storage.foldername(o.name))[1] = new.id::text
    )
  ) then
    raise exception 'Avatar must belong to the student profile';
  end if;
  if auth.uid() is not null and not public.is_admin() then
    if new.id <> old.id or new.email is distinct from old.email or new.batch_id is distinct from old.batch_id then
      raise exception 'Students cannot change their account email or batch assignment';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_student_profile_fields on public.profiles;
create trigger protect_student_profile_fields
before update on public.profiles
for each row execute function public.protect_profile_fields();

create or replace function public.set_community_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  student public.profiles%rowtype;
begin
  select * into student from public.profiles where id = auth.uid();
  if student.id is null or not student.is_active then
    raise exception 'An active student or admin profile is required';
  end if;
  if public.is_admin() then
    if not exists (
      select 1 from public.batches where id = new.batch_id and is_active
    ) then
      raise exception 'Choose an active batch for this post';
    end if;
  elsif student.batch_id is null or student.batch_id <> new.batch_id then
    raise exception 'A student can only post in their assigned batch community';
  end if;
  if new.image_path is not null and (
    (storage.foldername(new.image_path))[1] <> student.id::text
    or not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'community-images'
        and o.name = new.image_path
        and (storage.foldername(o.name))[1] = student.id::text
    )
  ) then
    raise exception 'Community image must belong to the posting student';
  end if;
  new.author_id := student.id;
  new.author_name := student.full_name;
  new.author_avatar_path := student.avatar_path;
  return new;
end;
$$;

drop trigger if exists set_community_post_author on public.community_posts;
create trigger set_community_post_author
before insert on public.community_posts
for each row execute function public.set_community_author();

create or replace function public.set_live_chat_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  student public.profiles%rowtype;
  session_batch uuid;
begin
  select * into student from public.profiles where id = auth.uid();
  if student.id is null or not student.is_active then
    raise exception 'An active student or admin profile is required';
  end if;
  select batch_id into session_batch
  from public.live_sessions
  where id = new.session_id and status = 'live';
  if session_batch is null or (
    not public.is_admin() and student.batch_id <> session_batch
  ) then
    raise exception 'This live class is not available to the current student';
  end if;
  new.batch_id := session_batch;
  new.author_id := student.id;
  new.author_name := student.full_name;
  return new;
end;
$$;

drop trigger if exists set_live_chat_author on public.live_chat;
create trigger set_live_chat_author
before insert on public.live_chat
for each row execute function public.set_live_chat_author();

create or replace function public.set_community_comment_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  post_batch uuid;
  author_profile public.profiles%rowtype;
begin
  select batch_id into post_batch
  from public.community_posts
  where id = new.post_id;

  if post_batch is null then
    raise exception 'Community post was not found';
  end if;

  if public.is_admin() then
    select * into author_profile from public.profiles where id = auth.uid() and is_active;
    if author_profile.id is null then
      raise exception 'Admin profile was not found';
    end if;
  else
    select * into author_profile from public.profiles where id = auth.uid() and is_active;
    if author_profile.id is null or author_profile.batch_id is distinct from post_batch then
      raise exception 'A student can only comment in their assigned batch';
    end if;
  end if;

  new.batch_id := post_batch;
  new.author_id := auth.uid();
  new.author_name := author_profile.full_name;
  return new;
end;
$$;

drop trigger if exists set_community_comment_author on public.community_comments;
create trigger set_community_comment_author
before insert on public.community_comments
for each row execute function public.set_community_comment_author();

create or replace function public.guard_inbox_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  thread_student uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  select student_id into thread_student
  from public.inbox_threads
  where id = new.thread_id;

  if thread_student is null then
    raise exception 'Inbox conversation was not found';
  end if;
  if not public.is_admin() and thread_student <> auth.uid() then
    raise exception 'Students can only message in their own conversation';
  end if;

  new.sender_id := auth.uid();
  return new;
end;
$$;

drop trigger if exists guard_inbox_message on public.inbox_messages;
create trigger guard_inbox_message
before insert on public.inbox_messages
for each row execute function public.guard_inbox_message();

create or replace function public.touch_inbox_thread()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.inbox_threads set updated_at = new.created_at where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists touch_inbox_thread on public.inbox_messages;
create trigger touch_inbox_thread
after insert on public.inbox_messages
for each row execute function public.touch_inbox_thread();

create or replace function public.admin_list_students()
returns table (
  id uuid,
  full_name text,
  email text,
  email_verified boolean,
  phone text,
  address text,
  batch_id uuid,
  created_at timestamptz,
  is_active boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  return query
  select p.id, p.full_name, u.email, u.email_confirmed_at is not null,
    p.phone, p.address, p.batch_id, p.created_at, p.is_active
  from public.profiles p
  join auth.users u on u.id = p.id
  where coalesce(u.raw_app_meta_data ->> 'role', '') <> 'admin'
  order by p.created_at desc;
end;
$$;

create or replace function public.admin_update_student(
  target_student_id uuid,
  new_full_name text,
  new_phone text,
  new_address text,
  new_batch_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;
  if char_length(btrim(new_full_name)) not between 1 and 120 then
    raise exception 'Student name must be between 1 and 120 characters';
  end if;
  if char_length(new_phone) > 40 or char_length(new_address) > 500 then
    raise exception 'Phone or address is too long';
  end if;
  if new_batch_id is not null and not exists (
    select 1 from public.batches where id = new_batch_id and is_active
  ) then
    raise exception 'Choose an active batch or remove the assignment';
  end if;

  update public.profiles
  set full_name = btrim(new_full_name),
      phone = btrim(new_phone),
      address = btrim(new_address),
      batch_id = new_batch_id
  where id = target_student_id
    and not exists (
      select 1 from auth.users u
      where u.id = target_student_id
        and coalesce(u.raw_app_meta_data ->> 'role', '') = 'admin'
    );

  if not found then
    raise exception 'Student profile was not found';
  end if;
end;
$$;

create or replace function public.admin_set_student_active(
  target_student_id uuid,
  make_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_banned_until timestamptz;
  prior_ban timestamptz;
  currently_active boolean;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;
  if target_student_id = auth.uid() then
    raise exception 'Admins cannot deactivate their own account here';
  end if;

  select p.is_active, p.previous_banned_until, u.banned_until
    into currently_active, prior_ban, user_banned_until
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = target_student_id
    and coalesce(u.raw_app_meta_data ->> 'role', '') <> 'admin'
  for update of p, u;

  if not found then
    raise exception 'Student account was not found';
  end if;
  if currently_active = make_active then
    return;
  end if;

  if make_active then
    update auth.users
    set banned_until = prior_ban
    where id = target_student_id;
    update public.profiles
    set is_active = true, previous_banned_until = null
    where id = target_student_id;
  else
    update public.profiles
    set is_active = false, previous_banned_until = user_banned_until
    where id = target_student_id;
    update auth.users
    set banned_until = 'infinity'::timestamptz
    where id = target_student_id;
  end if;
end;
$$;

create or replace function public.admin_delete_student(target_student_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;
  if target_student_id = auth.uid() then
    raise exception 'Admins cannot delete their own account here';
  end if;

  delete from auth.users
  where id = target_student_id
    and coalesce(raw_app_meta_data ->> 'role', '') <> 'admin';
  if not found then
    raise exception 'Student account was not found';
  end if;
end;
$$;

create or replace function public.start_inbox_thread(thread_subject text, first_message text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_thread_id uuid;
begin
  if auth.uid() is null or public.is_admin() or not public.is_active_user() then
    raise exception 'An active student account is required to start a conversation';
  end if;
  if char_length(btrim(thread_subject)) not between 1 and 160 then
    raise exception 'Subject must be between 1 and 160 characters';
  end if;
  if char_length(btrim(first_message)) not between 1 and 5000 then
    raise exception 'Message must be between 1 and 5000 characters';
  end if;

  insert into public.inbox_threads (student_id, subject)
  values (auth.uid(), btrim(thread_subject))
  returning id into new_thread_id;

  insert into public.inbox_messages (thread_id, sender_id, body)
  values (new_thread_id, auth.uid(), btrim(first_message));

  return new_thread_id;
end;
$$;

alter table public.batches enable row level security;
alter table public.profiles enable row level security;
alter table public.notices enable row level security;
alter table public.study_materials enable row level security;
alter table public.live_sessions enable row level security;
alter table public.community_posts enable row level security;
alter table public.live_chat enable row level security;
alter table public.community_comments enable row level security;
alter table public.inbox_threads enable row level security;
alter table public.inbox_messages enable row level security;

drop policy if exists "Authenticated users read batches" on public.batches;
create policy "Authenticated users read eligible batches" on public.batches for select to authenticated using (
  public.is_admin() or is_active or id = public.current_batch_id()
);
drop policy if exists "Admins manage batches" on public.batches;
create policy "Admins manage batches" on public.batches for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Students read own profile and admins read all" on public.profiles;
create policy "Students read own profile and admins read all" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
drop policy if exists "Students update own profile" on public.profiles;
create policy "Students update own profile" on public.profiles for update to authenticated using (
  public.is_admin() or (id = auth.uid() and public.is_active_user())
) with check (id = auth.uid() or public.is_admin());
drop policy if exists "Admins delete profiles" on public.profiles;

drop policy if exists "Students read matching notices" on public.notices;
create policy "Students read matching notices" on public.notices for select to authenticated using (
  public.is_admin() or (public.is_active_user() and (batch_id is null or batch_id = public.current_batch_id()))
);
drop policy if exists "Admins manage notices" on public.notices;
create policy "Admins manage notices" on public.notices for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Students read matching materials" on public.study_materials;
create policy "Students read matching materials" on public.study_materials for select to authenticated using (
  public.is_admin() or (public.is_active_user() and (batch_id is null or batch_id = public.current_batch_id()))
);
drop policy if exists "Admins manage materials" on public.study_materials;
create policy "Admins manage materials" on public.study_materials for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Students read matching sessions" on public.live_sessions;
create policy "Students read matching sessions" on public.live_sessions for select to authenticated using (
  public.is_admin() or (public.is_active_user() and (batch_id is null or batch_id = public.current_batch_id()))
);
drop policy if exists "Admins manage sessions" on public.live_sessions;
create policy "Admins manage sessions" on public.live_sessions for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Students read their batch posts" on public.community_posts;
create policy "Students read their batch posts" on public.community_posts for select to authenticated using (
  public.is_admin() or (public.is_active_user() and batch_id = public.current_batch_id())
);
drop policy if exists "Students create their own batch posts" on public.community_posts;
create policy "Students create their own batch posts" on public.community_posts for insert to authenticated with check (
  author_id = auth.uid() and public.is_active_user() and (
    public.is_admin() or batch_id = public.current_batch_id()
  )
);
drop policy if exists "Authors and admins delete posts" on public.community_posts;
create policy "Authors and admins delete posts" on public.community_posts for delete to authenticated using (author_id = auth.uid() or public.is_admin());

drop policy if exists "Students read their live chat" on public.live_chat;
create policy "Students read their live chat" on public.live_chat for select to authenticated using (
  public.is_admin() or (public.is_active_user() and batch_id = public.current_batch_id())
);
drop policy if exists "Students send live chat" on public.live_chat;
create policy "Students send live chat" on public.live_chat for insert to authenticated with check (
  author_id = auth.uid() and public.is_active_user() and (
    public.is_admin() or batch_id = public.current_batch_id()
  )
);

drop policy if exists "Eligible users read batch community comments" on public.community_comments;
create policy "Eligible users read batch community comments" on public.community_comments for select to authenticated using (
  public.is_admin() or (public.is_active_user() and batch_id = public.current_batch_id())
);
drop policy if exists "Eligible users comment in batch" on public.community_comments;
create policy "Eligible users comment in batch" on public.community_comments for insert to authenticated with check (
  author_id = auth.uid() and (
    public.is_admin() or (public.is_active_user() and batch_id = public.current_batch_id())
  )
);
drop policy if exists "Authors and admins delete community comments" on public.community_comments;
create policy "Authors and admins delete community comments" on public.community_comments for delete to authenticated using (
  author_id = auth.uid() or public.is_admin()
);

drop policy if exists "Students and admins read inbox threads" on public.inbox_threads;
create policy "Students and admins read inbox threads" on public.inbox_threads for select to authenticated using (
  public.is_admin() or (public.is_active_user() and student_id = auth.uid())
);
drop policy if exists "Students start own inbox threads" on public.inbox_threads;
create policy "Students start own inbox threads" on public.inbox_threads for insert to authenticated with check (
  student_id = auth.uid() and not public.is_admin() and public.is_active_user()
);
drop policy if exists "Students and admins read inbox messages" on public.inbox_messages;
create policy "Students and admins read inbox messages" on public.inbox_messages for select to authenticated using (
  public.is_admin() or exists (
    select 1 from public.inbox_threads t
    where t.id = thread_id and t.student_id = auth.uid() and public.is_active_user()
  )
);
drop policy if exists "Students and admins send inbox messages" on public.inbox_messages;
create policy "Students and admins send inbox messages" on public.inbox_messages for insert to authenticated with check (
  sender_id = auth.uid() and (
    public.is_admin() or exists (
      select 1 from public.inbox_threads t
      where t.id = thread_id and t.student_id = auth.uid() and public.is_active_user()
    )
  )
);
drop policy if exists "Recipients mark inbox messages read" on public.inbox_messages;
create policy "Recipients mark inbox messages read" on public.inbox_messages for update to authenticated using (
  sender_id <> auth.uid() and (
    public.is_admin() or exists (
      select 1 from public.inbox_threads t
      where t.id = thread_id and t.student_id = auth.uid() and public.is_active_user()
    )
  )
) with check (
  sender_id <> auth.uid() and (
    public.is_admin() or exists (
      select 1 from public.inbox_threads t
      where t.id = thread_id and t.student_id = auth.uid() and public.is_active_user()
    )
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('student-avatars', 'student-avatars', false, 5242880, array['image/jpeg','image/png','image/webp']),
  ('community-images', 'community-images', false, 8388608, array['image/jpeg','image/png','image/webp']),
  ('study-notes', 'study-notes', false, 26214400, array['application/pdf'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users read eligible avatars" on storage.objects;
create policy "Users read eligible avatars" on storage.objects for select to authenticated using (
  bucket_id = 'student-avatars' and (
    (storage.foldername(name))[1] = auth.uid()::text or public.is_admin() or exists (
      select 1 from public.community_posts p
      where p.author_avatar_path = name
        and p.author_id::text = (storage.foldername(name))[1]
        and p.batch_id = public.current_batch_id()
    )
  )
);
drop policy if exists "Users upload own avatar" on storage.objects;
create policy "Users upload own avatar" on storage.objects for insert to authenticated with check (
  bucket_id = 'student-avatars' and public.is_active_user() and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists "Users update own avatar" on storage.objects;
create policy "Users update own avatar" on storage.objects for update to authenticated using (
  bucket_id = 'student-avatars' and (storage.foldername(name))[1] = auth.uid()::text
) with check (bucket_id = 'student-avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users delete own avatar" on storage.objects;
create policy "Users delete own avatar" on storage.objects for delete to authenticated using (
  bucket_id = 'student-avatars' and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users read batch community images" on storage.objects;
create policy "Users read batch community images" on storage.objects for select to authenticated using (
  bucket_id = 'community-images' and exists (
    select 1 from public.community_posts p
    where p.image_path = name
      and p.author_id::text = (storage.foldername(name))[1]
      and p.batch_id = public.current_batch_id()
  )
);
drop policy if exists "Users upload own community images" on storage.objects;
create policy "Users upload own community images" on storage.objects for insert to authenticated with check (
  bucket_id = 'community-images' and public.is_active_user() and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists "Users delete own community images" on storage.objects;
create policy "Users delete own community images" on storage.objects for delete to authenticated using (
  bucket_id = 'community-images' and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Students read assigned notes" on storage.objects;
create policy "Students read assigned notes" on storage.objects for select to authenticated using (
  bucket_id = 'study-notes' and (
    public.is_admin() or (public.is_active_user() and exists (
      select 1 from public.study_materials m
      where m.storage_path = name and (m.batch_id is null or m.batch_id = public.current_batch_id())
    ))
  )
);
drop policy if exists "Admins upload notes" on storage.objects;
create policy "Admins upload notes" on storage.objects for insert to authenticated with check (
  bucket_id = 'study-notes' and public.is_admin()
);
drop policy if exists "Admins update notes" on storage.objects;
create policy "Admins update notes" on storage.objects for update to authenticated using (
  bucket_id = 'study-notes' and public.is_admin()
) with check (bucket_id = 'study-notes' and public.is_admin());
drop policy if exists "Admins delete notes" on storage.objects;
create policy "Admins delete notes" on storage.objects for delete to authenticated using (
  bucket_id = 'study-notes' and public.is_admin()
);

grant usage on schema public to authenticated;
revoke all on public.community_comments, public.inbox_threads, public.inbox_messages from public, anon, authenticated;
grant select on public.batches, public.profiles, public.notices, public.study_materials, public.live_sessions, public.community_posts, public.live_chat, public.community_comments, public.inbox_threads, public.inbox_messages to authenticated;
grant insert, update, delete on public.batches, public.notices, public.study_materials, public.live_sessions to authenticated;
grant update (full_name, phone, address, avatar_path) on public.profiles to authenticated;
grant update (batch_id) on public.profiles to authenticated;
grant insert, delete on public.community_posts to authenticated;
grant insert, delete on public.community_comments to authenticated;
grant insert on public.live_chat to authenticated;
grant insert on public.inbox_messages to authenticated;
grant update (read_at) on public.inbox_messages to authenticated;
grant insert on public.inbox_threads to authenticated;

revoke all on function public.admin_list_students() from public, anon, authenticated;
revoke all on function public.admin_update_student(uuid, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.admin_set_student_active(uuid, boolean) from public, anon, authenticated;
revoke all on function public.admin_delete_student(uuid) from public, anon, authenticated;
revoke all on function public.start_inbox_thread(text, text) from public, anon, authenticated;
grant execute on function public.admin_list_students() to authenticated;
grant execute on function public.admin_update_student(uuid, text, text, text, uuid) to authenticated;
grant execute on function public.admin_set_student_active(uuid, boolean) to authenticated;
grant execute on function public.admin_delete_student(uuid) to authenticated;
grant execute on function public.start_inbox_thread(text, text) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.live_chat;
exception when duplicate_object then
  null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.community_comments;
exception when duplicate_object then
  null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.inbox_threads;
exception when duplicate_object then
  null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.inbox_messages;
exception when duplicate_object then
  null;
end;
$$;
