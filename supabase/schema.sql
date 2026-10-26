-- Run this file once in the Supabase SQL Editor.
create extension if not exists pgcrypto;

create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
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

create or replace function public.current_batch_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.batch_id from public.profiles p where p.id = auth.uid();
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

create index if not exists profiles_batch_id_idx on public.profiles(batch_id);
create index if not exists notices_batch_created_idx on public.notices(batch_id, created_at desc);
create index if not exists materials_batch_created_idx on public.study_materials(batch_id, created_at desc);
create index if not exists live_sessions_batch_status_idx on public.live_sessions(batch_id, status);
create index if not exists community_posts_batch_created_idx on public.community_posts(batch_id, created_at desc);
create index if not exists live_chat_session_created_idx on public.live_chat(session_id, created_at);

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
  if student.id is null or student.batch_id is null or student.batch_id <> new.batch_id then
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
  if student.id is null then
    raise exception 'Student profile was not found';
  end if;
  select batch_id into session_batch
  from public.live_sessions
  where id = new.session_id and status = 'live';
  if student.id is null or session_batch is null or student.batch_id <> session_batch then
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

alter table public.batches enable row level security;
alter table public.profiles enable row level security;
alter table public.notices enable row level security;
alter table public.study_materials enable row level security;
alter table public.live_sessions enable row level security;
alter table public.community_posts enable row level security;
alter table public.live_chat enable row level security;

drop policy if exists "Authenticated users read batches" on public.batches;
create policy "Authenticated users read batches" on public.batches for select to authenticated using (true);
drop policy if exists "Admins manage batches" on public.batches;
create policy "Admins manage batches" on public.batches for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Students read own profile and admins read all" on public.profiles;
create policy "Students read own profile and admins read all" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
drop policy if exists "Students update own profile" on public.profiles;
create policy "Students update own profile" on public.profiles for update to authenticated using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());
drop policy if exists "Admins delete profiles" on public.profiles;
create policy "Admins delete profiles" on public.profiles for delete to authenticated using (public.is_admin());

drop policy if exists "Students read matching notices" on public.notices;
create policy "Students read matching notices" on public.notices for select to authenticated using (public.is_admin() or batch_id is null or batch_id = public.current_batch_id());
drop policy if exists "Admins manage notices" on public.notices;
create policy "Admins manage notices" on public.notices for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Students read matching materials" on public.study_materials;
create policy "Students read matching materials" on public.study_materials for select to authenticated using (public.is_admin() or batch_id is null or batch_id = public.current_batch_id());
drop policy if exists "Admins manage materials" on public.study_materials;
create policy "Admins manage materials" on public.study_materials for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Students read matching sessions" on public.live_sessions;
create policy "Students read matching sessions" on public.live_sessions for select to authenticated using (public.is_admin() or batch_id is null or batch_id = public.current_batch_id());
drop policy if exists "Admins manage sessions" on public.live_sessions;
create policy "Admins manage sessions" on public.live_sessions for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Students read their batch posts" on public.community_posts;
create policy "Students read their batch posts" on public.community_posts for select to authenticated using (public.is_admin() or batch_id = public.current_batch_id());
drop policy if exists "Students create their own batch posts" on public.community_posts;
create policy "Students create their own batch posts" on public.community_posts for insert to authenticated with check (author_id = auth.uid() and batch_id = public.current_batch_id());
drop policy if exists "Authors and admins delete posts" on public.community_posts;
create policy "Authors and admins delete posts" on public.community_posts for delete to authenticated using (author_id = auth.uid() or public.is_admin());

drop policy if exists "Students read their live chat" on public.live_chat;
create policy "Students read their live chat" on public.live_chat for select to authenticated using (public.is_admin() or batch_id = public.current_batch_id());
drop policy if exists "Students send live chat" on public.live_chat;
create policy "Students send live chat" on public.live_chat for insert to authenticated with check (author_id = auth.uid() and batch_id = public.current_batch_id());

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
  bucket_id = 'student-avatars' and (storage.foldername(name))[1] = auth.uid()::text
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
  bucket_id = 'community-images' and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists "Users delete own community images" on storage.objects;
create policy "Users delete own community images" on storage.objects for delete to authenticated using (
  bucket_id = 'community-images' and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Students read assigned notes" on storage.objects;
create policy "Students read assigned notes" on storage.objects for select to authenticated using (
  bucket_id = 'study-notes' and (
    public.is_admin() or exists (
      select 1 from public.study_materials m
      where m.storage_path = name and (m.batch_id is null or m.batch_id = public.current_batch_id())
    )
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
grant select on public.batches, public.profiles, public.notices, public.study_materials, public.live_sessions, public.community_posts, public.live_chat to authenticated;
grant insert, update, delete on public.batches, public.notices, public.study_materials, public.live_sessions to authenticated;
grant update (full_name, phone, address, avatar_path) on public.profiles to authenticated;
grant update (batch_id) on public.profiles to authenticated;
grant delete on public.profiles to authenticated;
grant insert, delete on public.community_posts to authenticated;
grant insert on public.live_chat to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.live_chat;
exception when duplicate_object then
  null;
end;
$$;
