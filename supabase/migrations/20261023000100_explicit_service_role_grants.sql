-- Explicit grants for the server (service_role).
--
-- Supabase projects created after 2026-05-30 (and all projects from
-- 2026-10-30) no longer grant table privileges to anon / authenticated /
-- service_role automatically (changelog 45329). The first migration already
-- grants anon/authenticated explicitly; the server routes relied on the old
-- defaults for service_role and fail with "permission denied" without this.
--
-- Least privilege: exactly what the Next.js server code and
-- scripts/create-admin.mjs use. Moderation and rate limiting go through
-- security-definer functions and need no table grants here.

grant select, insert on public.teams to service_role;             -- /api/submit: find-or-create team
grant select, insert on public.submissions to service_role;       -- /api/submit: idempotency lookup + insert; photo route lookup
grant select on public.screen_feed to service_role;               -- photo route: approved-only check
grant select, insert, update on public.admins to service_role;    -- scripts/create-admin.mjs upsert

-- belt and braces: these were granted in the first migration; restate so this
-- file alone documents every API-role privilege the app depends on
grant select on public.screen_feed to anon, authenticated;
grant select on public.teams, public.submissions, public.admins to authenticated;
grant execute on function public.take_rate_limit(text, int, int) to service_role;
grant execute on function public.moderate_submission(uuid, public.submission_status, text) to authenticated;
grant execute on function public.is_admin() to authenticated, service_role;
