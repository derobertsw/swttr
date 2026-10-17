-- Copy day carries a Backcountry day's tour plan, and itinerary reviews that
-- note tour plans are checked against them (#210, part of #205). See
-- docs/trip-tour-plans.md. Needs 023, 026 and 027.

-- Every tour plan on a trip as previewItinerary (src/lib/trip-itinerary.ts)
-- builds it for a review: {<plan id>: {date, revision}}. The date matters:
-- moving the trip's dates (021) keeps each plan's id and revision but puts it
-- on another date, so a review from before the move must not match.
CREATE FUNCTION public.trip_tour_plan_snapshot(p_trip_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(jsonb_object_agg(t.id, jsonb_build_object('date', d.date, 'revision', t.revision)), '{}'::jsonb)
    FROM public.trip_day_tour_plans t JOIN public.trip_days d ON d.id = t.trip_day_id
    WHERE t.trip_id = p_trip_id;
$$;
REVOKE ALL ON FUNCTION public.trip_tour_plan_snapshot(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trip_tour_plan_snapshot(uuid) TO service_role;

-- A reviewed itinerary edit or copy whose review also said what happens to
-- each changed day's tour plan, so the save is refused (40001) when any tour
-- plan on the trip was added, changed, removed or moved to another date since.
-- Then it's 027's
-- reviewed edit, which checks access points and runs the edit. It's an
-- overload: PostgREST picks it by the extra p_tour_plans argument, and an app
-- that sends none still gets 027's.
CREATE FUNCTION public.edit_trip_itinerary_reviewed(
  p_trip_id uuid,
  p_user_id text,
  p_action text,
  p_payload jsonb,
  p_access_points jsonb,
  p_tour_plans jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  PERFORM 1 FROM public.trips WHERE id = p_trip_id FOR UPDATE;
  IF public.trip_tour_plan_snapshot(p_trip_id) IS DISTINCT FROM p_tour_plans THEN
    RAISE EXCEPTION 'Tour plans changed. Review the change again.' USING ERRCODE = '40001';
  END IF;
  RETURN public.edit_trip_itinerary_reviewed(p_trip_id, p_user_id, p_action, p_payload, p_access_points);
END;
$$;
REVOKE ALL ON FUNCTION public.edit_trip_itinerary_reviewed(uuid, text, text, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.edit_trip_itinerary_reviewed(uuid, text, text, jsonb, jsonb, jsonb) TO service_role;

-- copy_trip_day (023) as before, plus p_payload.plan: 'none' (or absent, as
-- before this migration) copies no tour plan. 'replace' and 'keep' also copy
-- the `from` day's tour plan, organizer only: 'replace' overwrites the plan on
-- every date, 'keep' leaves the dates that already have one. The payload's
-- `expected` doesn't list plans: the reviewed edit above checks them all.
CREATE OR REPLACE FUNCTION public.copy_trip_day(
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
  me public.trip_members;
  base_id uuid;
  v_stop uuid;
  v_place jsonb;
  v_kit text;
  v_plan text;
  v_from date;
  v_dates date[];
  v_source public.trip_days;
  v_day public.trip_days;
  v_source_kit public.trip_member_day_kits;
  v_source_plan public.trip_day_tour_plans;
  v_at timestamptz;
  v_entry jsonb;
BEGIN
  SELECT * INTO current_trip FROM public.trips WHERE id = p_trip_id FOR UPDATE;
  IF NOT FOUND OR p_user_id IS NULL OR (current_trip.owner_user_id <> p_user_id AND NOT EXISTS (
    SELECT 1 FROM public.trip_members
      WHERE trip_id = p_trip_id AND user_id = p_user_id AND status <> 'left'
  )) THEN
    RAISE EXCEPTION 'Not found' USING ERRCODE = '42501';
  END IF;

  v_kit := p_payload->>'kit';
  v_plan := coalesce(p_payload->>'plan', 'none');
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR v_kit IS NULL OR v_kit NOT IN ('none', 'replace', 'keep')
    OR v_plan NOT IN ('none', 'replace', 'keep')
    OR jsonb_typeof(p_payload->'dates') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_payload->'expected'->'from') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_payload->'expected'->'days') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid copy' USING ERRCODE = '22023';
  END IF;
  SELECT s.id INTO base_id FROM public.trip_stops s WHERE s.trip_id = p_trip_id ORDER BY s.position LIMIT 1;
  v_from := (p_payload->>'from')::date;
  v_dates := ARRAY(SELECT DISTINCT e::date FROM jsonb_array_elements_text(p_payload->'dates') AS e ORDER BY 1);
  IF v_from IS NULL OR cardinality(v_dates) = 0 OR v_from = ANY (v_dates) THEN
    RAISE EXCEPTION 'Choose other days to copy to' USING ERRCODE = '22023';
  END IF;

  -- Day rows are locked before they're checked: PATCH /days/:date changes an
  -- activity without the trip lock, so a concurrent edit is waited for and
  -- then seen, rather than checked stale and overwritten.
  SELECT * INTO v_source FROM public.trip_days d WHERE d.trip_id = p_trip_id AND d.date = v_from FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Day not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_kit <> 'none' THEN
    SELECT * INTO me FROM public.trip_members
      WHERE trip_id = p_trip_id AND user_id = p_user_id AND status <> 'left';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Only a member on the trip has a kit to copy' USING ERRCODE = '22023';
    END IF;
    SELECT k.* INTO v_source_kit FROM public.trip_member_day_kits k
      WHERE k.trip_day_id = v_source.id AND k.trip_member_id = me.id
        AND (k.outfit IS NOT NULL OR jsonb_array_length(k.items) > 0)
      FOR UPDATE;
    IF NOT FOUND AND p_payload->'expected'->'from'->>'kit' IS NULL THEN
      RAISE EXCEPTION 'No kit to copy' USING ERRCODE = '22023';
    END IF;
  END IF;
  -- The organizer manages tour plans (026), so only they copy one.
  IF v_plan <> 'none' THEN
    IF current_trip.owner_user_id <> p_user_id THEN
      RAISE EXCEPTION 'Only the organizer copies a tour plan' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_source_plan FROM public.trip_day_tour_plans t WHERE t.trip_day_id = v_source.id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No tour plan to copy' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- The source day as reviewed, with the place it goes to.
  v_stop := coalesce(v_source.stop_id, base_id);
  v_place := nullif(p_payload->'expected'->'from'->'stop', 'null'::jsonb);
  IF v_source.stop_id IS DISTINCT FROM (p_payload->'expected'->'from'->>'stop_id')::uuid
    OR (v_stop IS NULL) <> (v_place IS NULL)
    OR (v_stop IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.trip_stops s
        WHERE s.id = v_stop AND s.id = (v_place->>'id')::uuid AND s.name = v_place->>'name'
          AND s.latitude IS NOT DISTINCT FROM (v_place->>'latitude')::numeric
          AND s.longitude IS NOT DISTINCT FROM (v_place->>'longitude')::numeric
    ))
    OR v_source.activity IS DISTINCT FROM p_payload->'expected'->'from'->>'activity'
    OR (v_kit <> 'none' AND v_source_kit.updated_at IS DISTINCT FROM (p_payload->'expected'->'from'->>'kit')::timestamptz) THEN
    RAISE EXCEPTION 'The day you''re copying changed. Review it again.' USING ERRCODE = '40001';
  END IF;

  -- Each date once, as reviewed. A date without a day can't match.
  IF v_dates IS DISTINCT FROM ARRAY(
    SELECT e->>'date' FROM jsonb_array_elements(p_payload->'expected'->'days') AS e ORDER BY 1
  )::date[] THEN
    RAISE EXCEPTION 'These days changed. Review them again.' USING ERRCODE = '40001';
  END IF;
  FOR v_entry IN SELECT value FROM jsonb_array_elements(p_payload->'expected'->'days') LOOP
    SELECT * INTO v_day FROM public.trip_days d WHERE d.trip_id = p_trip_id AND d.date = (v_entry->>'date')::date FOR UPDATE;
    IF NOT FOUND OR v_day.stop_id IS DISTINCT FROM (v_entry->>'stop_id')::uuid
      OR v_day.activity IS DISTINCT FROM v_entry->>'activity' THEN
      RAISE EXCEPTION 'These days changed. Review them again.' USING ERRCODE = '40001';
    END IF;
    v_stop := coalesce(v_day.stop_id, base_id);
    v_place := nullif(v_entry->'stop', 'null'::jsonb);
    IF (v_stop IS NULL) <> (v_place IS NULL) OR (v_stop IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.trip_stops s
        WHERE s.id = v_stop AND s.id = (v_place->>'id')::uuid AND s.name = v_place->>'name'
          AND s.latitude IS NOT DISTINCT FROM (v_place->>'latitude')::numeric
          AND s.longitude IS NOT DISTINCT FROM (v_place->>'longitude')::numeric
    )) THEN
      RAISE EXCEPTION 'These days changed. Review them again.' USING ERRCODE = '40001';
    END IF;
    IF v_kit <> 'none' THEN
      v_at := NULL;
      SELECT k.updated_at INTO v_at FROM public.trip_member_day_kits k
        WHERE k.trip_day_id = v_day.id AND k.trip_member_id = me.id
          AND (k.outfit IS NOT NULL OR jsonb_array_length(k.items) > 0)
        FOR UPDATE;
      IF v_at IS DISTINCT FROM (v_entry->>'kit')::timestamptz THEN
        RAISE EXCEPTION 'Your kits on these days changed. Review them again.' USING ERRCODE = '40001';
      END IF;
    END IF;
  END LOOP;

  UPDATE public.trip_days AS d SET stop_id = v_source.stop_id, activity = v_source.activity
    WHERE d.trip_id = p_trip_id AND d.date = ANY (v_dates);

  IF v_kit <> 'none' THEN
    -- The outfit and checklist come along; each day keeps its note.
    INSERT INTO public.trip_member_day_kits (trip_day_id, trip_member_id, effort, items, state, outfit, outfit_saved_at)
      SELECT d.id, me.id, v_source_kit.effort, v_source_kit.items, v_source_kit.state, v_source_kit.outfit, v_source_kit.outfit_saved_at
        FROM public.trip_days d
        WHERE d.trip_id = p_trip_id AND d.date = ANY (v_dates)
          AND (v_kit = 'replace' OR NOT EXISTS (
            SELECT 1 FROM public.trip_member_day_kits k
              WHERE k.trip_day_id = d.id AND k.trip_member_id = me.id
                AND (k.outfit IS NOT NULL OR jsonb_array_length(k.items) > 0)
          ))
      ON CONFLICT (trip_day_id, trip_member_id) DO UPDATE SET effort = EXCLUDED.effort, items = EXCLUDED.items,
        state = EXCLUDED.state, outfit = EXCLUDED.outfit, outfit_saved_at = EXCLUDED.outfit_saved_at;
  END IF;

  IF v_plan <> 'none' THEN
    -- Every field of the plan comes along, its time zone too: the days get the
    -- source's destination. A replaced plan keeps its row, so an editor open
    -- on it sees the new revision.
    INSERT INTO public.trip_day_tour_plans AS t (trip_id, trip_day_id, objective, route_url, meet_time, meet_day_offset,
      distance, distance_unit, ascent, ascent_unit, duration_minutes, metrics_source, metrics_source_url,
      approach_notes, access_notes, access_url, backup_plan, return_time, return_day_offset,
      checkin_notes, pickup_notes, time_zone, created_by, updated_by)
      SELECT p_trip_id, d.id, v_source_plan.objective, v_source_plan.route_url, v_source_plan.meet_time, v_source_plan.meet_day_offset,
        v_source_plan.distance, v_source_plan.distance_unit, v_source_plan.ascent, v_source_plan.ascent_unit,
        v_source_plan.duration_minutes, v_source_plan.metrics_source, v_source_plan.metrics_source_url,
        v_source_plan.approach_notes, v_source_plan.access_notes, v_source_plan.access_url, v_source_plan.backup_plan,
        v_source_plan.return_time, v_source_plan.return_day_offset, v_source_plan.checkin_notes, v_source_plan.pickup_notes,
        v_source_plan.time_zone, p_user_id, p_user_id
        FROM public.trip_days d
        WHERE d.trip_id = p_trip_id AND d.date = ANY (v_dates)
          AND (v_plan = 'replace' OR NOT EXISTS (SELECT 1 FROM public.trip_day_tour_plans x WHERE x.trip_day_id = d.id))
    ON CONFLICT (trip_day_id) DO UPDATE SET objective = EXCLUDED.objective, route_url = EXCLUDED.route_url,
      meet_time = EXCLUDED.meet_time, meet_day_offset = EXCLUDED.meet_day_offset, distance = EXCLUDED.distance,
      distance_unit = EXCLUDED.distance_unit, ascent = EXCLUDED.ascent, ascent_unit = EXCLUDED.ascent_unit,
      duration_minutes = EXCLUDED.duration_minutes, metrics_source = EXCLUDED.metrics_source,
      metrics_source_url = EXCLUDED.metrics_source_url, approach_notes = EXCLUDED.approach_notes,
      access_notes = EXCLUDED.access_notes, access_url = EXCLUDED.access_url, backup_plan = EXCLUDED.backup_plan,
      return_time = EXCLUDED.return_time, return_day_offset = EXCLUDED.return_day_offset,
      checkin_notes = EXCLUDED.checkin_notes, pickup_notes = EXCLUDED.pickup_notes, time_zone = EXCLUDED.time_zone,
      revision = t.revision + 1, updated_by = EXCLUDED.updated_by;
  END IF;

  RETURN jsonb_build_object('action', 'copy_day');
END;
$$;

REVOKE ALL ON FUNCTION public.copy_trip_day(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.copy_trip_day(uuid, text, jsonb) TO service_role;
