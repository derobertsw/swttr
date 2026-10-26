-- The meet time on the day, for every sport (#333, part 3). See
-- docs/trip-locations.md#meet-time.
--
-- Apply this on its own, after 026 and 20261020000407, before deploying the
-- API that reads it. An API from before this change keeps working against it:
-- it still reads the tour plan's meet columns, and its tour plan saves with a
-- meet time land on the day too. An API from after this change that runs
-- without it shows each tour plan's meet time, and refuses (503) to save a meet
-- time or a tour plan, so no meet time is lost.

-- A wall-clock time at the destination, meet_day_offset -1 for the evening
-- before (a hut approach), and the destination's IANA time zone the server
-- found when it was saved. Where the crew meets stays the day's access point
-- (027). It's on the day, so moving the trip's dates (021) keeps it with the
-- day, as it keeps the day's starting point (029).
ALTER TABLE public.trip_days
  ADD COLUMN meet_time time,
  ADD COLUMN meet_day_offset smallint NOT NULL DEFAULT 0
    CONSTRAINT trip_days_meet_day_offset CHECK (meet_day_offset IN (-1, 0)),
  ADD COLUMN meet_time_zone text,
  ADD CONSTRAINT trip_days_meet_unset CHECK (meet_time IS NOT NULL OR (meet_day_offset = 0 AND meet_time_zone IS NULL));

-- Each tour plan's meet time becomes its day's, with the plan's time zone,
-- whether the plan is in use or kept on a day with another activity. A day's
-- own meet time comes first.
UPDATE public.trip_days AS d
  SET meet_time = t.meet_time, meet_day_offset = t.meet_day_offset, meet_time_zone = t.time_zone
  FROM public.trip_day_tour_plans AS t
  WHERE t.trip_day_id = d.id AND t.meet_time IS NOT NULL AND d.meet_time IS NULL;

-- The plan keeps its meet columns for an older API, which reads them. Its check
-- that the return comes after them goes, since a newer API doesn't keep them up
-- to date; the API checks a plan's return against the day's meet time instead.
DO $migration$
DECLARE
  v_name text;
BEGIN
  SELECT conname INTO v_name FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.trip_day_tour_plans'::regclass AND contype = 'c'
      AND pg_catalog.pg_get_constraintdef(oid) LIKE '%meet_day_offset%'
      AND pg_catalog.pg_get_constraintdef(oid) LIKE '%return_day_offset%';
  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.trip_day_tour_plans DROP CONSTRAINT %I', v_name);
  END IF;
END;
$migration$;

-- Sets or clears a day's meet time. Organizer only, like every logistics edit.
-- p_payload:
-- - date and day_id: the day the editor opened for. After a date change
--   another day can hold the date.
-- - meet_time: "HH:MM", or null to clear it; meet_day_offset: 0, or -1 for the
--   day before; time_zone: the server's lookup, or null.
-- - expected: {meet_time, meet_day_offset} as the editor showed them.
-- When the day or its meet time no longer matches, nothing changes (PT409).
CREATE FUNCTION public.set_trip_day_meet(
  p_trip_id uuid,
  p_user_id text,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  current_trip public.trips;
  v_day public.trip_days;
  v_expected jsonb := p_payload->'expected';
  v_time time;
BEGIN
  SELECT * INTO current_trip FROM public.trips WHERE id = p_trip_id FOR UPDATE;
  IF NOT FOUND OR p_user_id IS NULL OR current_trip.owner_user_id <> p_user_id THEN
    RAISE EXCEPTION 'Organizer only' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR coalesce(jsonb_typeof(p_payload->'meet_time'), '') NOT IN ('null', 'string')
    OR coalesce(p_payload->>'meet_day_offset', '') NOT IN ('-1', '0')
    OR jsonb_typeof(v_expected) IS DISTINCT FROM 'object'
    OR coalesce(jsonb_typeof(v_expected->'meet_time'), '') NOT IN ('null', 'string')
    OR coalesce(v_expected->>'meet_day_offset', '') NOT IN ('-1', '0') THEN
    RAISE EXCEPTION 'Invalid meet time' USING ERRCODE = '22023';
  END IF;
  v_time := (p_payload->>'meet_time')::time;

  SELECT * INTO v_day FROM public.trip_days WHERE trip_id = p_trip_id AND date = (p_payload->>'date')::date FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found' USING ERRCODE = 'P0002'; END IF;
  IF v_day.id IS DISTINCT FROM (p_payload->>'day_id')::uuid
    OR v_day.meet_time IS DISTINCT FROM (v_expected->>'meet_time')::time
    OR v_day.meet_day_offset IS DISTINCT FROM (v_expected->>'meet_day_offset')::smallint THEN
    RAISE EXCEPTION 'Meet time changed. Review it again.' USING ERRCODE = 'PT409';
  END IF;

  UPDATE public.trip_days
    SET meet_time = v_time,
      meet_day_offset = CASE WHEN v_time IS NULL THEN 0 ELSE (p_payload->>'meet_day_offset')::smallint END,
      meet_time_zone = CASE WHEN v_time IS NULL THEN NULL ELSE p_payload->>'time_zone' END
    WHERE id = v_day.id;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.set_trip_day_meet(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_trip_day_meet(uuid, text, jsonb) TO service_role;

-- mutate_trip_tour_plan (026, with 20261020000407's conflict code) as before,
-- except for the meet time. A payload without meet_time, from a newer API,
-- leaves the plan's meet columns and the day's meet time alone. One with it,
-- from an older API, still saves it in the plan, and on the day too, with the
-- plan's time zone.
CREATE OR REPLACE FUNCTION public.mutate_trip_tour_plan(
  p_trip_id uuid, p_user_id text, p_date date, p_day_id uuid, p_expected_revision integer,
  p_request_id uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  current_trip public.trips;
  v_day public.trip_days;
  saved public.trip_day_tour_plans;
  prior public.trip_tour_plan_mutations;
  request_hash text;
  response jsonb;
  v_meet boolean := coalesce(p_payload ? 'meet_time', false);
BEGIN
  SELECT * INTO current_trip FROM public.trips WHERE id = p_trip_id FOR UPDATE;
  IF NOT FOUND OR p_user_id IS NULL OR current_trip.owner_user_id <> p_user_id THEN
    RAISE EXCEPTION 'Organizer only' USING ERRCODE = '42501';
  END IF;
  request_hash := encode(sha256(convert_to(jsonb_build_object('date', p_date, 'day', p_day_id, 'action', p_action,
    'payload', coalesce(p_payload, '{}'::jsonb) - 'time_zone')::text, 'UTF8')), 'hex');
  SELECT * INTO prior FROM public.trip_tour_plan_mutations WHERE trip_id = p_trip_id AND request_id = p_request_id;
  IF FOUND THEN
    IF prior.input_hash <> request_hash THEN RAISE EXCEPTION 'Request identity reused' USING ERRCODE = '22023'; END IF;
    RETURN prior.result;
  END IF;

  SELECT * INTO v_day FROM public.trip_days WHERE trip_id = p_trip_id AND date = p_date FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Day not found' USING ERRCODE = 'P0002'; END IF;
  IF p_day_id IS NULL OR v_day.id <> p_day_id THEN
    RAISE EXCEPTION 'This date is another day now. Review the saved plan.' USING ERRCODE = 'PT409';
  END IF;
  SELECT * INTO saved FROM public.trip_day_tour_plans WHERE trip_day_id = v_day.id FOR UPDATE;
  IF p_expected_revision IS NULL OR coalesce(saved.revision, 0) <> p_expected_revision THEN
    RAISE EXCEPTION 'Tour plan changed. Review the saved plan.' USING ERRCODE = 'PT409';
  END IF;

  IF p_action = 'remove' AND saved.id IS NOT NULL THEN
    DELETE FROM public.trip_day_tour_plans WHERE id = saved.id;
    response := jsonb_build_object('revision', 0);
  ELSIF p_action = 'save' AND jsonb_typeof(p_payload) = 'object' THEN
    INSERT INTO public.trip_day_tour_plans AS t (trip_id, trip_day_id, objective, route_url, meet_time, meet_day_offset,
      distance, distance_unit, ascent, ascent_unit, duration_minutes, metrics_source, metrics_source_url,
      approach_notes, access_notes, access_url, backup_plan, return_time, return_day_offset,
      checkin_notes, pickup_notes, time_zone, created_by, updated_by)
    VALUES (p_trip_id, v_day.id, p_payload->>'objective', p_payload->>'route_url', (p_payload->>'meet_time')::time,
      coalesce((p_payload->>'meet_day_offset')::smallint, 0), (p_payload->>'distance')::numeric, p_payload->>'distance_unit',
      (p_payload->>'ascent')::integer, p_payload->>'ascent_unit', (p_payload->>'duration_minutes')::integer,
      p_payload->>'metrics_source', p_payload->>'metrics_source_url', p_payload->>'approach_notes',
      p_payload->>'access_notes', p_payload->>'access_url', p_payload->>'backup_plan', (p_payload->>'return_time')::time,
      coalesce((p_payload->>'return_day_offset')::smallint, 0), p_payload->>'checkin_notes', p_payload->>'pickup_notes',
      p_payload->>'time_zone', p_user_id, p_user_id)
    ON CONFLICT (trip_day_id) DO UPDATE SET objective = EXCLUDED.objective, route_url = EXCLUDED.route_url,
      meet_time = CASE WHEN v_meet THEN EXCLUDED.meet_time ELSE t.meet_time END,
      meet_day_offset = CASE WHEN v_meet THEN EXCLUDED.meet_day_offset ELSE t.meet_day_offset END, distance = EXCLUDED.distance,
      distance_unit = EXCLUDED.distance_unit, ascent = EXCLUDED.ascent, ascent_unit = EXCLUDED.ascent_unit,
      duration_minutes = EXCLUDED.duration_minutes, metrics_source = EXCLUDED.metrics_source,
      metrics_source_url = EXCLUDED.metrics_source_url, approach_notes = EXCLUDED.approach_notes,
      access_notes = EXCLUDED.access_notes, access_url = EXCLUDED.access_url, backup_plan = EXCLUDED.backup_plan,
      return_time = EXCLUDED.return_time, return_day_offset = EXCLUDED.return_day_offset,
      checkin_notes = EXCLUDED.checkin_notes, pickup_notes = EXCLUDED.pickup_notes, time_zone = EXCLUDED.time_zone,
      revision = t.revision + 1, updated_by = EXCLUDED.updated_by
    RETURNING * INTO saved;
    IF v_meet THEN
      UPDATE public.trip_days
        SET meet_time = saved.meet_time,
          meet_day_offset = CASE WHEN saved.meet_time IS NULL THEN 0 ELSE saved.meet_day_offset END,
          meet_time_zone = CASE WHEN saved.meet_time IS NULL THEN NULL ELSE saved.time_zone END
        WHERE id = v_day.id;
    END IF;
    response := jsonb_build_object('revision', saved.revision);
  ELSE
    RAISE EXCEPTION 'Invalid tour plan change' USING ERRCODE = '22000';
  END IF;
  INSERT INTO public.trip_tour_plan_mutations (trip_id, request_id, input_hash, result)
    VALUES (p_trip_id, p_request_id, request_hash, response);
  RETURN response;
END;
$$;

NOTIFY pgrst, 'reload schema';
