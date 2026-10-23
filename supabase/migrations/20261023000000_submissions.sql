-- Realm Hack '26 — photo submissions with moderation.
--
-- Access model (least privilege):
--   anon           : can read `screen_feed` only (approved items, no file paths). Nothing else.
--   authenticated  : nothing, unless listed in `admins`.
--   admins         : read submissions/teams, read photos in the private bucket,
--                    moderate via `moderate_submission()` (checked inside the DB).
--   service_role   : used only by Next.js server routes to insert submissions,
--                    upload photos and serve approved photos to the screen.

create extension if not exists citext with schema extensions;

-- ---------------------------------------------------------------- admins
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()));
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

-- ---------------------------------------------------------------- teams
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name extensions.citext not null unique
    check (char_length(name::text) between 2 and 32),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- submissions
create type public.submission_status as enum ('pending', 'approved', 'rejected');

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  photo_path text not null unique,
  status public.submission_status not null default 'pending',
  -- duplicate safeguards
  client_token uuid not null unique,          -- idempotency key from the phone
  content_sha256 text not null,               -- hash of the uploaded file
  -- abuse controls (hashed, never raw IPs)
  submitter_hash text not null,
  -- normalised image metadata
  width int not null check (width > 0),
  height int not null check (height > 0),
  bytes int not null check (bytes > 0),
  -- moderation metadata
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  reject_reason text check (char_length(reject_reason) <= 200),
  created_at timestamptz not null default now()
);

-- the same image cannot be pending/approved twice (a rejected one may be retried)
create unique index submissions_sha_live_idx
  on public.submissions (content_sha256)
  where status <> 'rejected';
create index submissions_status_created_idx on public.submissions (status, created_at);
create index submissions_team_idx on public.submissions (team_id);

-- ---------------------------------------------------------------- screen feed
-- The only table the public screen can read: approved items without file paths.
create table public.screen_feed (
  submission_id uuid primary key references public.submissions (id) on delete cascade,
  team_name text not null,
  approved_at timestamptz not null default now()
);
create index screen_feed_approved_idx on public.screen_feed (approved_at);

-- keep the feed in sync with moderation decisions
create or replace function public.sync_screen_feed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    insert into public.screen_feed (submission_id, team_name, approved_at)
    select new.id, t.name::text, coalesce(new.reviewed_at, now())
    from public.teams t where t.id = new.team_id
    on conflict (submission_id) do nothing;
  elsif new.status <> 'approved' and tg_op = 'UPDATE' and old.status = 'approved' then
    delete from public.screen_feed where submission_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_screen_feed() from public, anon, authenticated;

create trigger submissions_sync_screen_feed
  after insert or update of status on public.submissions
  for each row execute function public.sync_screen_feed();

-- ---------------------------------------------------------------- moderation RPC
-- Authorisation lives in the database: callable by authenticated users, but it
-- refuses anyone who is not in `admins`.
create or replace function public.moderate_submission(
  p_submission_id uuid,
  p_decision public.submission_status,
  p_reason text default null
)
returns public.submissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.submissions;
begin
  if not public.is_admin() then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  if p_decision = 'pending' then
    raise exception 'decision must be approved or rejected' using errcode = '22023';
  end if;

  update public.submissions
     set status = p_decision,
         reviewed_by = (select auth.uid()),
         reviewed_at = now(),
         reject_reason = case when p_decision = 'rejected' then left(p_reason, 200) end
   where id = p_submission_id
  returning * into result;

  if result.id is null then
    raise exception 'submission not found' using errcode = 'P0002';
  end if;
  return result;
end;
$$;

revoke all on function public.moderate_submission(uuid, public.submission_status, text) from public, anon;
grant execute on function public.moderate_submission(uuid, public.submission_status, text) to authenticated;

-- ---------------------------------------------------------------- rate limiting
-- Atomic fixed-window counter: returns true while `p_key` has made at most
-- `p_max` calls in the current `p_window_seconds` window.
create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  hits int not null
);

create or replace function public.take_rate_limit(p_key text, p_window_seconds int, p_max int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  insert into public.rate_limits as r (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update
    set hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
        window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits into n;
  return n <= p_max;
end;
$$;

revoke all on function public.take_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.take_rate_limit(text, int, int) to service_role;

-- ---------------------------------------------------------------- RLS
alter table public.admins enable row level security;
alter table public.teams enable row level security;
alter table public.submissions enable row level security;
alter table public.screen_feed enable row level security;
alter table public.rate_limits enable row level security;

-- drop the default broad grants; grant back only what each role needs
revoke all on public.admins, public.teams, public.submissions, public.screen_feed, public.rate_limits
  from anon, authenticated;

grant select on public.screen_feed to anon, authenticated;
grant select on public.teams, public.submissions to authenticated;
grant select on public.admins to authenticated;

create policy "screen feed is public"
  on public.screen_feed for select
  to anon, authenticated
  using (true);

create policy "admins read teams"
  on public.teams for select
  to authenticated
  using ((select public.is_admin()));

create policy "admins read submissions"
  on public.submissions for select
  to authenticated
  using ((select public.is_admin()));

create policy "users see their own admin row"
  on public.admins for select
  to authenticated
  using (user_id = (select auth.uid()));

-- no insert/update/delete policies: writes happen through the service role
-- (server routes) or the security-definer RPC above.

-- ---------------------------------------------------------------- realtime
alter publication supabase_realtime add table public.screen_feed;

-- ---------------------------------------------------------------- storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('submissions', 'submissions', false, 5242880, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- admins may read photos (moderation queue); nobody else gets a policy.
-- uploads and screen delivery go through the service role on the server.
create policy "admins read submission photos"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'submissions' and (select public.is_admin()));
