-- The app only reaches the database from API routes, using the service-role
-- key (which bypasses RLS) and enforcing per-user access in code. The public
-- roles had full read/write on user data through permissive USING (true)
-- policies; lock them out so the anon key grants nothing.
--
-- Apply only after the deployed app uses SUPABASE_SERVICE_ROLE_KEY: code still
-- on the anon key loses database access once this runs.

-- 1. Drop the permissive policies on user data. RLS stays enabled with no
--    policies, which denies every role except the service role.
DO $$
DECLARE
  target text;
  existing record;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'user_wardrobe',
    'user_item_mappings',
    'user_custom_items',
    'user_preferences',
    'trips',
    'trip_stops',
    'trip_members',
    'trip_days',
    'trip_member_day_kits',
    'trip_group_gear',
    'trip_nudges'
  ] LOOP
    CONTINUE WHEN to_regclass('public.' || target) IS NULL;
    FOR existing IN
      SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = target
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', existing.policyname, target);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target);
  END LOOP;
END $$;

-- 2. Revoke the public roles' table access, including for objects created
--    later, so new tables are not exposed through the anon key by default.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- 3. Pin search_path on the trigger functions (Supabase security advisor).
--    They only call built-ins, which resolve from pg_catalog regardless.
ALTER FUNCTION public.update_updated_at_column() SET search_path = '';
ALTER FUNCTION public.update_user_item_mappings_updated_at() SET search_path = '';
ALTER FUNCTION public.update_user_custom_items_updated_at() SET search_path = '';
ALTER FUNCTION public.set_item_media_urls() SET search_path = '';
