-- Copy a trip day's plan to other days in one transaction (#176). See
-- docs/trip-editing.md.
--
-- p_payload is {from, dates, kit, expected}:
-- - Every date in `dates` gets the `from` day's stop_id and activity. A NULL
--   stop_id stays NULL, so the copy goes to the base as the source day does.
-- - kit 'none' copies no kit. 'replace' and 'keep' also copy the user's own
--   kit on `from` (its outfit and checklist; each day keeps its note): 'replace'
--   overwrites the user's kit on every date, 'keep' leaves the dates where the
--   user already has one. A kit is an outfit or checklist items, as in
--   save_trip_kits. Nobody else's kit is copied or changed.
-- - expected is what the review showed: {from: {stop_id, activity, stop, kit},
--   days: [{date, stop_id, activity, stop, kit}]}. stop is the day's effective
--   stop (its own, or the base) as {id, name, latitude, longitude}, or null for
--   no destination, so a stop renamed or moved since the review is caught. kit
--   is the updated_at of the user's kit there or null; kits are checked only
--   when one is copied. When the trip no longer matches, nothing changes and
--   the error is 40001.
CREATE FUNCTION public.copy_trip_day(
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
  v_from date;
  v_dates date[];
  v_source public.trip_days;
  v_day public.trip_days;
  v_source_kit public.trip_member_day_kits;
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
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR v_kit IS NULL OR v_kit NOT IN ('none', 'replace', 'keep')
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

  RETURN jsonb_build_object('action', 'copy_day');
END;
$$;

-- The API checks the Clerk identity and calls this with the service-role client.
REVOKE ALL ON FUNCTION public.copy_trip_day(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.copy_trip_day(uuid, text, jsonb) TO service_role;
