-- Reusing conditions sources across trip days (#211, PR 2). See
-- docs/trip-conditions.md.
--
-- - attach_trip_conditions_source lists a source the trip already has on more
--   days, after the organizer reviewed which.
-- - Copy day can bring the copied day's sources along (attachments only,
--   never reviews), through an edit_trip_itinerary_reviewed overload that
--   checks the trip's attachments against the copy's review.
-- - A date change that removes a day checks the day's sources and reviews
--   against the review that listed them.
--
-- Needs 031, 030 and the change_trip_dates from 026. Order with
-- 20261028130000 (day notes) doesn't matter. Deploy the API that uses it
-- first, then apply it on its own:
-- - The API from this change, without this migration, says listing a source
--   on more days and copying sources aren't available yet (503), and retries
--   a date change without the sources check, as before.
-- - An API from before this change never calls the new functions, but sends
--   no sources with a removed day, so this change_trip_dates refuses (409) its
--   date changes that remove a day with sources until the new API is out.

-- Listing a source on more days, here or with Copy day, adds to its revision,
-- so an edit reviewed for the days it was on can't then be saved over days its
-- review didn't list (mutate_trip_conditions_source in 031 checks the
-- revision). Removing it from a day doesn't: an edit then changes fewer days
-- than its review listed, never more.

-- The organizer lists a source the trip already has on more days. p_days is
-- [{date, day_id}]: the days the review showed, each still holding its date
-- (otherwise PT409). A day that already lists the source is left as it is.
-- Reviews recorded on a day before the source was removed from it show again,
-- since they belong to the day and the source.
CREATE FUNCTION public.attach_trip_conditions_source(
  p_trip_id uuid, p_user_id text, p_source_id uuid, p_expected_revision integer, p_request_id uuid, p_days jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  current_trip public.trips;
  v_day public.trip_days;
  v_entry jsonb;
  saved public.trip_conditions_sources;
  prior public.trip_conditions_mutations;
  request_hash text;
  response jsonb;
BEGIN
  SELECT * INTO current_trip FROM public.trips WHERE id = p_trip_id FOR UPDATE;
  IF NOT FOUND OR p_user_id IS NULL OR current_trip.owner_user_id <> p_user_id THEN
    RAISE EXCEPTION 'Organizer only' USING ERRCODE = '42501';
  END IF;
  request_hash := encode(sha256(convert_to(jsonb_build_object('kind', 'attach', 'user', p_user_id, 'source', p_source_id,
    'revision', p_expected_revision, 'days', coalesce(p_days, 'null'::jsonb))::text, 'UTF8')), 'hex');
  SELECT * INTO prior FROM public.trip_conditions_mutations WHERE trip_id = p_trip_id AND request_id = p_request_id;
  IF FOUND THEN
    IF prior.input_hash <> request_hash THEN RAISE EXCEPTION 'Request identity reused' USING ERRCODE = '22023'; END IF;
    RETURN prior.result;
  END IF;
  IF jsonb_typeof(p_days) IS DISTINCT FROM 'array' OR jsonb_array_length(p_days) = 0 OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_days) AS e(value) WHERE jsonb_typeof(e.value) IS DISTINCT FROM 'object'
  ) THEN
    RAISE EXCEPTION 'Choose days to list the source on' USING ERRCODE = '22000';
  END IF;

  SELECT * INTO saved FROM public.trip_conditions_sources WHERE trip_id = p_trip_id AND id = p_source_id FOR UPDATE;
  IF NOT FOUND OR p_expected_revision IS NULL OR saved.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'Source changed. Review it again.' USING ERRCODE = 'PT409';
  END IF;
  FOR v_entry IN SELECT value FROM jsonb_array_elements(p_days) LOOP
    SELECT * INTO v_day FROM public.trip_days WHERE trip_id = p_trip_id AND date = (v_entry->>'date')::date;
    IF NOT FOUND OR v_day.id IS DISTINCT FROM (v_entry->>'day_id')::uuid THEN
      RAISE EXCEPTION 'These days changed. Review them again.' USING ERRCODE = 'PT409';
    END IF;
    INSERT INTO public.trip_day_conditions_sources (trip_id, trip_day_id, source_id, added_by)
      VALUES (p_trip_id, v_day.id, saved.id, p_user_id)
      ON CONFLICT DO NOTHING;
  END LOOP;
  UPDATE public.trip_conditions_sources SET revision = revision + 1, updated_by = p_user_id
    WHERE id = saved.id
    RETURNING * INTO saved;

  response := jsonb_build_object('source_id', saved.id, 'revision', saved.revision);
  INSERT INTO public.trip_conditions_mutations (trip_id, request_id, input_hash, result)
    VALUES (p_trip_id, p_request_id, request_hash, response);
  RETURN response;
END;
$$;
REVOKE ALL ON FUNCTION public.attach_trip_conditions_source(uuid, text, uuid, integer, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_trip_conditions_source(uuid, text, uuid, integer, uuid, jsonb) TO service_role;

-- Where the trip's sources are listed, as conditionsCheck (src/lib/trip-itinerary.ts)
-- builds it for a copy's review: {<date>: [source ids, in order]}, for each
-- day that lists any. Keyed by date, so a day that moved doesn't match.
CREATE FUNCTION public.trip_conditions_snapshot(p_trip_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(jsonb_object_agg(listed.date, listed.source_ids), '{}'::jsonb) FROM (
    SELECT d.date, jsonb_agg(a.source_id ORDER BY a.source_id) AS source_ids
      FROM public.trip_day_conditions_sources a JOIN public.trip_days d ON d.id = a.trip_day_id
      WHERE a.trip_id = p_trip_id
      GROUP BY d.date
  ) AS listed;
$$;
REVOKE ALL ON FUNCTION public.trip_conditions_snapshot(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trip_conditions_snapshot(uuid) TO service_role;

-- A reviewed copy that also brings the copied day's conditions sources. The
-- save is refused (PT409) when any source on the trip was listed on or
-- removed from a day since the review; then it's 030's reviewed edit, which
-- checks tour plans and access points and copies the day. p_payload.sources:
-- 'add' (organizer only, copy_day only) lists every source on `from` on each
-- of `dates` too. Days keep the sources they had, and no review comes along:
-- reviews belong to the day they were recorded for. 'none', or none, copies
-- no source. It's an overload: PostgREST picks it by the extra p_conditions
-- argument, and an app that sends none still gets 030's.
CREATE FUNCTION public.edit_trip_itinerary_reviewed(
  p_trip_id uuid,
  p_user_id text,
  p_action text,
  p_payload jsonb,
  p_access_points jsonb,
  p_tour_plans jsonb,
  p_conditions jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  current_trip public.trips;
  v_sources text := coalesce(p_payload->>'sources', 'none');
  result jsonb;
BEGIN
  SELECT * INTO current_trip FROM public.trips WHERE id = p_trip_id FOR UPDATE;
  IF public.trip_conditions_snapshot(p_trip_id) IS DISTINCT FROM p_conditions THEN
    RAISE EXCEPTION 'Conditions sources changed. Review the change again.' USING ERRCODE = 'PT409';
  END IF;
  IF v_sources NOT IN ('none', 'add') OR (v_sources = 'add' AND p_action IS DISTINCT FROM 'copy_day') THEN
    RAISE EXCEPTION 'Invalid change' USING ERRCODE = '22023';
  END IF;
  -- It checks who's asking, the days and the copy; anything raised after it undoes the copy too.
  result := public.edit_trip_itinerary_reviewed(p_trip_id, p_user_id, p_action, p_payload, p_access_points, p_tour_plans);
  IF v_sources = 'add' THEN
    -- The organizer manages sources (031), so only they copy them.
    IF current_trip.owner_user_id IS DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'Only the organizer copies conditions sources' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.trip_day_conditions_sources a JOIN public.trip_days d ON d.id = a.trip_day_id
        WHERE d.trip_id = p_trip_id AND d.date = (p_payload->>'from')::date
    ) THEN
      RAISE EXCEPTION 'No conditions sources to copy' USING ERRCODE = '22023';
    END IF;
    WITH added AS (
      INSERT INTO public.trip_day_conditions_sources (trip_id, trip_day_id, source_id, added_by)
        SELECT p_trip_id, target.id, a.source_id, p_user_id
          FROM public.trip_day_conditions_sources a
          JOIN public.trip_days copied ON copied.id = a.trip_day_id
          JOIN public.trip_days target ON target.trip_id = copied.trip_id
          WHERE copied.trip_id = p_trip_id AND copied.date = (p_payload->>'from')::date
            AND target.date IN (SELECT e::date FROM jsonb_array_elements_text(p_payload->'dates') AS e)
        ON CONFLICT DO NOTHING
        RETURNING source_id
    )
    UPDATE public.trip_conditions_sources AS s SET revision = s.revision + 1, updated_by = p_user_id
      WHERE s.id IN (SELECT source_id FROM added);
  END IF;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.edit_trip_itinerary_reviewed(uuid, text, text, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.edit_trip_itinerary_reviewed(uuid, text, text, jsonb, jsonb, jsonb, jsonb) TO service_role;

-- A date change that removes a day checks the sources listed on it and the
-- review entries recorded for them against the review that listed them, as it
-- checks the day's tour plan and notes, so sources listed or reviews recorded
-- after the review aren't deleted unseen (409, and the API sends the current
-- review). A day without sources is listed as before. Only that list changes
-- in change_trip_dates (026, as 20261021201500 and 20261028130000 leave it);
-- it follows the tour plan, so 20261028130000's notes can come before or after.
DO $migration$
DECLARE
  target oid;
  legacy constant text := 'FROM public.trip_day_tour_plans t WHERE t.trip_day_id = d.id), ''{}''::jsonb)';
  replaced constant text := legacy || ' || coalesce((SELECT jsonb_build_object(''conditions'', jsonb_build_object('
    || '''source_ids'', jsonb_agg(a.source_id ORDER BY a.source_id), '
    || '''entries'', (SELECT count(*) FROM public.trip_conditions_reviews r JOIN public.trip_day_conditions_sources ra'
    || ' ON ra.trip_day_id = r.trip_day_id AND ra.source_id = r.source_id WHERE r.trip_day_id = d.id)))'
    || ' FROM public.trip_day_conditions_sources a WHERE a.trip_day_id = d.id HAVING count(*) > 0), ''{}''::jsonb)';
  updated integer := 0;
BEGIN
  FOR target IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'change_trip_dates' AND strpos(p.prosrc, legacy) > 0
      AND strpos(p.prosrc, 'trip_day_conditions_sources') = 0
  LOOP
    EXECUTE replace(pg_get_functiondef(target), legacy, replaced);
    updated := updated + 1;
  END LOOP;
  IF updated = 0 THEN
    RAISE EXCEPTION 'change_trip_dates removed-day check not found; apply 026 first';
  END IF;
END;
$migration$;

NOTIFY pgrst, 'reload schema';
