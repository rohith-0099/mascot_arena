-- Security model tests. Run: npx supabase test db   (or --linked; rolled back either way)
begin;
create extension if not exists pgtap with schema extensions;
-- hosted projects may already have pgtap in a schema outside the search_path
select set_config('search_path', current_setting('search_path') || ', ' || quote_ident(n.nspname), true)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
 where e.extname = 'pgtap';
select plan(37);

-- ------------------------------------------------------------ table grants
-- anon: only the approved-only screen feed
select ok(has_table_privilege('anon', 'public.screen_feed', 'select'), 'anon can read screen_feed');
select ok(not has_table_privilege('anon', 'public.submissions', 'select'), 'anon cannot read submissions');
select ok(not has_table_privilege('anon', 'public.teams', 'select'), 'anon cannot read teams');
select ok(not has_table_privilege('anon', 'public.admins', 'select'), 'anon cannot read admins');
select ok(not has_table_privilege('anon', 'public.rate_limits', 'select'), 'anon cannot read rate_limits');
select ok(not has_table_privilege('anon', 'public.submissions', 'insert'), 'anon cannot insert submissions');
select ok(not has_table_privilege('anon', 'public.screen_feed', 'insert'), 'anon cannot write screen_feed');

-- authenticated: read-only (RLS narrows to admins); no direct writes at all
select ok(not has_table_privilege('authenticated', 'public.submissions', 'update'), 'authenticated cannot update submissions directly');
select ok(not has_table_privilege('authenticated', 'public.admins', 'insert'), 'authenticated cannot add admins');
select ok(not has_table_privilege('authenticated', 'public.screen_feed', 'insert'), 'authenticated cannot write screen_feed');

-- service_role: exactly what the server needs (hosted projects no longer grant this by default)
select ok(has_table_privilege('service_role', 'public.teams', 'insert'), 'service_role can insert teams');
select ok(has_table_privilege('service_role', 'public.teams', 'select'), 'service_role can read teams');
select ok(has_table_privilege('service_role', 'public.submissions', 'insert'), 'service_role can insert submissions');
select ok(has_table_privilege('service_role', 'public.submissions', 'select'), 'service_role can read submissions');
select ok(has_table_privilege('service_role', 'public.screen_feed', 'select'), 'service_role can read screen_feed');
select ok(has_table_privilege('service_role', 'public.admins', 'insert'), 'service_role can add admins (create-admin script)');

-- ------------------------------------------------------------ function grants
select ok(not has_function_privilege('anon', 'public.moderate_submission(uuid, public.submission_status, text)', 'execute'), 'anon cannot call moderate_submission');
select ok(not has_function_privilege('anon', 'public.take_rate_limit(text, int, int)', 'execute'), 'anon cannot call take_rate_limit');
select ok(not has_function_privilege('authenticated', 'public.take_rate_limit(text, int, int)', 'execute'), 'authenticated cannot call take_rate_limit');
select ok(has_function_privilege('service_role', 'public.take_rate_limit(text, int, int)', 'execute'), 'service_role can call take_rate_limit');

-- ------------------------------------------------------------ storage + realtime config
select is((select public from storage.buckets where id = 'submissions'), false, 'photo bucket is private');
select ok(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'screen_feed'), 'screen_feed is in the realtime publication');
select ok(not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'submissions'), 'submissions are NOT broadcast');

-- ------------------------------------------------------------ fixtures
insert into auth.users (id, email, aud, role) values
  ('11111111-1111-4111-8111-111111111111', 'admin@test.local', 'authenticated', 'authenticated'),
  ('22222222-2222-4222-8222-222222222222', 'user@test.local', 'authenticated', 'authenticated');
insert into public.admins (user_id) values ('11111111-1111-4111-8111-111111111111');
insert into public.teams (id, name) values ('33333333-3333-4333-8333-333333333333', 'Test Team');
insert into public.submissions (id, team_id, photo_path, client_token, content_sha256, submitter_hash, width, height, bytes)
values ('44444444-4444-4444-8444-444444444444', '33333333-3333-4333-8333-333333333333', 'test/a.jpg',
        gen_random_uuid(), 'sha-a', 'h', 10, 10, 10);
insert into storage.objects (bucket_id, name) values ('submissions', 'test/a.jpg');

-- ------------------------------------------------------------ as a signed-in NON-admin
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);

select is((select count(*)::int from public.submissions), 0, 'non-admin sees no submissions');
select is((select count(*)::int from public.teams), 0, 'non-admin sees no teams');
select is((select count(*)::int from storage.objects where bucket_id = 'submissions'), 0, 'non-admin cannot see photos in storage');
select is(public.is_admin(), false, 'is_admin() is false for a normal user');
select throws_ok(
  $$ select public.moderate_submission('44444444-4444-4444-8444-444444444444', 'approved') $$,
  '42501', 'not authorised', 'non-admin cannot moderate');

-- ------------------------------------------------------------ as anon
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select count(*)::int from public.screen_feed), 0, 'nothing on the public feed while pending');
select is((select count(*)::int from storage.objects where bucket_id = 'submissions'), 0, 'anon cannot see photos in storage');

-- ------------------------------------------------------------ as the admin
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

select is((select count(*)::int from public.submissions where id = '44444444-4444-4444-8444-444444444444'), 1, 'admin sees submissions');
select is((select count(*)::int from storage.objects where bucket_id = 'submissions' and name = 'test/a.jpg'), 1, 'admin can see photos in storage');
select throws_ok(
  $$ select public.moderate_submission('44444444-4444-4444-8444-444444444444', 'pending') $$,
  '22023', null, 'decision must be approved or rejected');

select lives_ok($$ select public.moderate_submission('44444444-4444-4444-8444-444444444444', 'approved') $$, 'admin can approve');
select is((select count(*)::int from public.screen_feed where submission_id = '44444444-4444-4444-8444-444444444444'), 1,
  'approval publishes to screen_feed');

select lives_ok($$ select public.moderate_submission('44444444-4444-4444-8444-444444444444', 'rejected', 'pulled') $$, 'admin can pull an approved photo');
select is((select count(*)::int from public.screen_feed where submission_id = '44444444-4444-4444-8444-444444444444'), 0,
  'pulling removes it from screen_feed');

select * from finish();
rollback;
