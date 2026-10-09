-- Edit a saved trip's shared itinerary in one transaction (#176). See
-- docs/trip-editing.md.
--
-- A day whose stop_id is NULL goes to the trip's base, its first stop by
-- position. Each action changes only the days it was reviewed for and keeps
-- every other day's effective destination:
-- - remove_stop {stop_id, reassign_to, expected}: the days using the stop (its
--   own, plus the inherited ones when it's the base) move to reassign_to, which
--   is required while other stops remain. Removing the last stop leaves its
--   days with no destination.
-- - reorder_stops {order, expected}: when another stop becomes first, days
--   without a stop are pinned to the old base.
-- - assign_days {dates, stop_id?, activity?, expected}: a key that's present
--   sets that field on every date, so "activity": null clears it.
-- - set_day_place {date, place, scope, expected}: 'day' gives the day a stop at
--   the place (a stop already there, or a new last stop); 'stop' moves the
--   day's stop to the place for every day at it, or moves those days to a stop
--   already there, or adds the place as the base when the trip has no stops.
--
-- `expected` is what the review showed. When the trip no longer matches it,
-- nothing changes and the error is 40001.
CREATE FUNCTION public.edit_trip_itinerary(
  p_trip_id uuid,
  p_user_id text,
  p_action text,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  current_trip public.trips;
  base_id uuid;
  v_stop uuid;
  v_target uuid;
  v_day public.trip_days;
  v_dates date[];
  v_stops uuid[];
  v_order uuid[];
  v_seen jsonb;
  v_rows integer;
  v_lowest integer;
  v_activity text;
  v_name text;
  v_latitude numeric;
  v_longitude numeric;
  v_scope text;
BEGIN
  SELECT * INTO current_trip FROM public.trips WHERE id = p_trip_id FOR UPDATE;
  IF NOT FOUND OR p_user_id IS NULL OR (current_trip.owner_user_id <> p_user_id AND NOT EXISTS (
    SELECT 1 FROM public.trip_members
      WHERE trip_id = p_trip_id AND user_id = p_user_id AND status <> 'left'
  )) THEN
    RAISE EXCEPTION 'Not found' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid itinerary change' USING ERRCODE = '22023';
  END IF;

  SELECT s.id INTO base_id FROM public.trip_stops s WHERE s.trip_id = p_trip_id ORDER BY s.position LIMIT 1;

  IF p_action = 'remove_stop' THEN
    v_stop := (p_payload->>'stop_id')::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.trip_stops s WHERE s.id = v_stop AND s.trip_id = p_trip_id) THEN
      RAISE EXCEPTION 'Stop not found' USING ERRCODE = 'P0002';
    END IF;
    v_target := (p_payload->>'reassign_to')::uuid;
    IF EXISTS (SELECT 1 FROM public.trip_stops s WHERE s.trip_id = p_trip_id AND s.id <> v_stop) THEN
      IF v_target IS NULL OR v_target = v_stop
        OR NOT EXISTS (SELECT 1 FROM public.trip_stops s WHERE s.id = v_target AND s.trip_id = p_trip_id) THEN
        RAISE EXCEPTION 'Choose another stop on this trip for its days' USING ERRCODE = '22023';
      END IF;
    ELSIF v_target IS NOT NULL THEN
      RAISE EXCEPTION 'The trip has no other stop' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_payload->'expected') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Invalid itinerary change' USING ERRCODE = '22023';
    END IF;

    SELECT coalesce(array_agg(d.date ORDER BY d.date), '{}') INTO v_dates
      FROM public.trip_days d
      WHERE d.trip_id = p_trip_id AND (d.stop_id = v_stop OR (d.stop_id IS NULL AND v_stop = base_id));
    IF v_dates IS DISTINCT FROM ARRAY(SELECT e::date FROM jsonb_array_elements_text(p_payload->'expected') AS e ORDER BY 1) THEN
      RAISE EXCEPTION 'Days at this stop changed. Review them again.' USING ERRCODE = '40001';
    END IF;

    -- Move the days first: deleting the stop would set them to NULL, which
    -- means the base.
    UPDATE public.trip_days AS d SET stop_id = v_target
      WHERE d.trip_id = p_trip_id AND (d.stop_id = v_stop OR (d.stop_id IS NULL AND v_stop = base_id));
    DELETE FROM public.trip_stops AS s WHERE s.id = v_stop;

  ELSIF p_action = 'reorder_stops' THEN
    IF jsonb_typeof(p_payload->'order') IS DISTINCT FROM 'array' OR jsonb_typeof(p_payload->'expected') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Invalid itinerary change' USING ERRCODE = '22023';
    END IF;
    SELECT coalesce(array_agg(s.id ORDER BY s.position), '{}') INTO v_stops FROM public.trip_stops s WHERE s.trip_id = p_trip_id;
    IF v_stops IS DISTINCT FROM ARRAY(
      SELECT e.value::uuid FROM jsonb_array_elements_text(p_payload->'expected') WITH ORDINALITY AS e(value, n) ORDER BY e.n
    ) THEN
      RAISE EXCEPTION 'Stops changed. Reload them.' USING ERRCODE = '40001';
    END IF;
    v_order := ARRAY(SELECT e.value::uuid FROM jsonb_array_elements_text(p_payload->'order') WITH ORDINALITY AS e(value, n) ORDER BY e.n);
    IF cardinality(v_order) <> cardinality(v_stops) OR NOT (v_order <@ v_stops)
      OR (SELECT count(DISTINCT o) FROM unnest(v_order) AS o) <> cardinality(v_stops) THEN
      RAISE EXCEPTION 'List every stop once' USING ERRCODE = '22023';
    END IF;

    -- Days without a stop keep going to the old base.
    IF cardinality(v_order) > 0 AND v_order[1] <> base_id THEN
      UPDATE public.trip_days AS d SET stop_id = base_id WHERE d.trip_id = p_trip_id AND d.stop_id IS NULL;
    END IF;
    -- Through positions below every current one, one row at a time, so no two
    -- stops ever share a position.
    SELECT least(coalesce(min(s.position), 0), 0) INTO v_lowest FROM public.trip_stops s WHERE s.trip_id = p_trip_id;
    FOR i IN 1..cardinality(v_order) LOOP
      UPDATE public.trip_stops AS s SET position = v_lowest - i WHERE s.id = v_order[i];
    END LOOP;
    FOR i IN 1..cardinality(v_order) LOOP
      UPDATE public.trip_stops AS s SET position = i - 1 WHERE s.id = v_order[i];
    END LOOP;

  ELSIF p_action = 'assign_days' THEN
    IF jsonb_typeof(p_payload->'dates') IS DISTINCT FROM 'array' OR jsonb_typeof(p_payload->'expected') IS DISTINCT FROM 'array'
      OR NOT (p_payload ? 'stop_id' OR p_payload ? 'activity') THEN
      RAISE EXCEPTION 'Invalid itinerary change' USING ERRCODE = '22023';
    END IF;
    v_dates := ARRAY(SELECT DISTINCT e::date FROM jsonb_array_elements_text(p_payload->'dates') AS e);
    IF cardinality(v_dates) = 0 THEN
      RAISE EXCEPTION 'Choose days to change' USING ERRCODE = '22023';
    END IF;
    IF p_payload ? 'stop_id' THEN
      v_target := (p_payload->>'stop_id')::uuid;
      IF v_target IS NULL OR NOT EXISTS (SELECT 1 FROM public.trip_stops s WHERE s.id = v_target AND s.trip_id = p_trip_id) THEN
        RAISE EXCEPTION 'Choose a stop on this trip' USING ERRCODE = '22023';
      END IF;
    END IF;
    IF p_payload ? 'activity' THEN
      v_activity := p_payload->>'activity';
      IF v_activity IS NOT NULL AND (btrim(v_activity) = '' OR char_length(v_activity) > 80) THEN
        RAISE EXCEPTION 'Activities are 1-80 characters' USING ERRCODE = '22023';
      END IF;
    END IF;

    SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('date', d.date, 'stop_id', d.stop_id, 'activity', d.activity)), '[]'::jsonb)
      INTO v_rows, v_seen
      FROM public.trip_days d
      WHERE d.trip_id = p_trip_id AND d.date = ANY (v_dates);
    -- A requested date without a day drops out of both lists, so the counts
    -- must match too. Each day is listed once, so containment both ways means
    -- the lists match.
    IF v_rows <> cardinality(v_dates) OR jsonb_array_length(p_payload->'expected') <> v_rows
      OR NOT (v_seen @> (p_payload->'expected') AND (p_payload->'expected') @> v_seen) THEN
      RAISE EXCEPTION 'These days changed. Review them again.' USING ERRCODE = '40001';
    END IF;

    UPDATE public.trip_days AS d
      SET stop_id = CASE WHEN p_payload ? 'stop_id' THEN v_target ELSE d.stop_id END,
          activity = CASE WHEN p_payload ? 'activity' THEN v_activity ELSE d.activity END
      WHERE d.trip_id = p_trip_id AND d.date = ANY (v_dates);

  ELSIF p_action = 'set_day_place' THEN
    v_name := btrim(p_payload->'place'->>'name');
    v_latitude := (p_payload->'place'->>'latitude')::numeric;
    v_longitude := (p_payload->'place'->>'longitude')::numeric;
    v_scope := p_payload->>'scope';
    IF v_name IS NULL OR v_name = '' OR char_length(v_name) > 200
      OR v_latitude IS NULL OR v_latitude NOT BETWEEN -90 AND 90
      OR v_longitude IS NULL OR v_longitude NOT BETWEEN -180 AND 180
      OR v_scope IS NULL OR v_scope NOT IN ('day', 'stop')
      OR jsonb_typeof(p_payload->'expected'->'dates') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Invalid itinerary change' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_day FROM public.trip_days d WHERE d.trip_id = p_trip_id AND d.date = (p_payload->>'date')::date;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Day not found' USING ERRCODE = 'P0002';
    END IF;
    v_stop := coalesce(v_day.stop_id, base_id);
    IF v_scope = 'day' AND v_stop IS NULL THEN
      -- With no stops, a new stop is the base for every day.
      RAISE EXCEPTION 'Add the place for every day' USING ERRCODE = '22023';
    END IF;

    -- The days that change: this one, or every day at its stop.
    IF v_scope = 'day' THEN
      v_dates := ARRAY[v_day.date];
    ELSE
      SELECT coalesce(array_agg(d.date ORDER BY d.date), '{}') INTO v_dates
        FROM public.trip_days d
        WHERE d.trip_id = p_trip_id AND (d.stop_id = v_stop OR (d.stop_id IS NULL AND v_stop IS NOT DISTINCT FROM base_id));
    END IF;
    -- The stop's own place too, so a save can't overwrite a newer change to it.
    IF v_stop IS DISTINCT FROM (p_payload->'expected'->>'stop_id')::uuid
      OR v_dates IS DISTINCT FROM ARRAY(SELECT e::date FROM jsonb_array_elements_text(p_payload->'expected'->'dates') AS e ORDER BY 1)
      OR (v_stop IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.trip_stops s
          WHERE s.id = v_stop AND s.name = p_payload->'expected'->'stop'->>'name'
            AND s.latitude IS NOT DISTINCT FROM (p_payload->'expected'->'stop'->>'latitude')::numeric
            AND s.longitude IS NOT DISTINCT FROM (p_payload->'expected'->'stop'->>'longitude')::numeric
      )) THEN
      RAISE EXCEPTION 'This day''s destination changed. Review it again.' USING ERRCODE = '40001';
    END IF;

    -- A stop already at this place, the day's own first.
    SELECT s.id INTO v_target FROM public.trip_stops s
      WHERE s.trip_id = p_trip_id AND s.name = v_name
        AND abs(s.latitude - v_latitude) <= 0.0001 AND abs(s.longitude - v_longitude) <= 0.0001
      ORDER BY (s.id IS NOT DISTINCT FROM v_stop) DESC, s.position LIMIT 1;
    IF v_scope = 'stop' AND v_stop IS NOT NULL THEN
      IF v_target IS NULL THEN
        UPDATE public.trip_stops AS s SET name = v_name, latitude = v_latitude, longitude = v_longitude WHERE s.id = v_stop;
      ELSIF v_target <> v_stop THEN
        -- Another stop is already there: its days move to it.
        UPDATE public.trip_days AS d SET stop_id = v_target
          WHERE d.trip_id = p_trip_id AND (d.stop_id = v_stop OR (d.stop_id IS NULL AND v_stop = base_id));
      END IF;
    ELSE
      -- Add the place after the other stops when no stop is there yet.
      IF v_target IS NULL THEN
        INSERT INTO public.trip_stops (trip_id, position, name, latitude, longitude)
          SELECT p_trip_id, coalesce(max(s.position) + 1, 0), v_name, v_latitude, v_longitude
            FROM public.trip_stops s WHERE s.trip_id = p_trip_id
          RETURNING id INTO v_target;
      END IF;
      IF v_scope = 'day' AND v_target <> v_stop THEN
        UPDATE public.trip_days AS d SET stop_id = v_target WHERE d.id = v_day.id;
      END IF;
    END IF;

  ELSE
    RAISE EXCEPTION 'Unknown itinerary change' USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object('action', p_action);
END;
$$;

-- The API checks the Clerk identity and calls this with the service-role client.
REVOKE ALL ON FUNCTION public.edit_trip_itinerary(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.edit_trip_itinerary(uuid, text, text, jsonb) TO service_role;
