-- A destination's access point (#208): where the crew parks or meets on a day
-- at that stop. It's never the stop's weather location, which stays in
-- trip_stops.latitude/longitude. See docs/trip-locations.md.
--
-- The stop's point is shared by every day at the stop. A day can have its own
-- instead: trip_days.access_point, with access_point_stop_id, the stop it was
-- set for. It applies only while the day is still at that stop (its own
-- stop_id, or the base, the first stop, when that's NULL), so a day that an
-- itinerary edit (022, 023) moves to another destination doesn't keep the old
-- one's parking. Moving a day to new dates (021) keeps it.
ALTER TABLE public.trip_stops ADD COLUMN access_point jsonb
  CONSTRAINT trip_stops_access_point_valid CHECK (access_point IS NULL OR public.is_trip_location(access_point));

ALTER TABLE public.trip_days
  ADD COLUMN access_point jsonb
    CONSTRAINT trip_days_access_point_valid CHECK (access_point IS NULL OR public.is_trip_location(access_point)),
  ADD COLUMN access_point_stop_id uuid,
  ADD CONSTRAINT trip_days_access_point_stop CHECK ((access_point IS NULL) = (access_point_stop_id IS NULL));

-- Sets or removes the access point for one day or for every day at its stop,
-- in one transaction. Organizer only, like every logistics edit. p_payload:
-- - date: the day the change was made from.
-- - scope: 'day' sets the day's own point, or with a null location removes it
--   so the day uses its stop's again. 'stop' sets or removes the stop's point
--   and clears the own points of every day at the stop.
-- - location: a place (is_trip_location), or null.
-- - expected: what the review showed. {stop_id, point, days}: the day's stop,
--   that stop's point, and each day at the stop in date order as
--   {date, point}, with the own point that applies to it or null. When the
--   trip no longer matches, nothing changes and the error is 40001.
CREATE FUNCTION public.set_trip_access_point(
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
  v_stop public.trip_stops;
  v_base uuid;
  v_location jsonb;
  v_days jsonb;
BEGIN
  SELECT * INTO current_trip FROM public.trips WHERE id = p_trip_id FOR UPDATE;
  IF NOT FOUND OR p_user_id IS NULL OR current_trip.owner_user_id <> p_user_id THEN
    RAISE EXCEPTION 'Organizer only' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR NOT p_payload ? 'location'
    OR coalesce(p_payload->>'scope', '') NOT IN ('day', 'stop')
    OR jsonb_typeof(p_payload->'expected') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_payload->'expected'->'days') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid access point change' USING ERRCODE = '22023';
  END IF;
  v_location := nullif(p_payload->'location', 'null'::jsonb);
  IF v_location IS NOT NULL AND NOT public.is_trip_location(v_location) THEN
    RAISE EXCEPTION 'Invalid location' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_day FROM public.trip_days WHERE trip_id = p_trip_id AND date = (p_payload->>'date')::date;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found' USING ERRCODE = 'P0002'; END IF;
  SELECT id INTO v_base FROM public.trip_stops WHERE trip_id = p_trip_id ORDER BY position LIMIT 1;
  SELECT * INTO v_stop FROM public.trip_stops WHERE trip_id = p_trip_id AND id = coalesce(v_day.stop_id, v_base);

  -- The review's stop, its point, and the days at it with their own points.
  IF v_stop.id IS NULL OR v_stop.id IS DISTINCT FROM (p_payload->'expected'->>'stop_id')::uuid
    OR v_stop.access_point IS DISTINCT FROM nullif(p_payload->'expected'->'point', 'null'::jsonb) THEN
    RAISE EXCEPTION 'Access point changed. Review it again.' USING ERRCODE = '40001';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('date', d.date,
      'point', CASE WHEN d.access_point_stop_id = v_stop.id THEN d.access_point END) ORDER BY d.date), '[]'::jsonb)
    INTO v_days FROM public.trip_days d WHERE d.trip_id = p_trip_id AND coalesce(d.stop_id, v_base) = v_stop.id;
  IF v_days IS DISTINCT FROM p_payload->'expected'->'days' THEN
    RAISE EXCEPTION 'Access point changed. Review it again.' USING ERRCODE = '40001';
  END IF;

  IF p_payload->>'scope' = 'day' THEN
    UPDATE public.trip_days SET access_point = v_location,
      access_point_stop_id = CASE WHEN v_location IS NULL THEN NULL ELSE v_stop.id END
      WHERE id = v_day.id;
  ELSE
    UPDATE public.trip_stops SET access_point = v_location WHERE id = v_stop.id;
    UPDATE public.trip_days SET access_point = NULL, access_point_stop_id = NULL
      WHERE trip_id = p_trip_id AND coalesce(stop_id, v_base) = v_stop.id AND access_point IS NOT NULL;
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.set_trip_access_point(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_trip_access_point(uuid, text, jsonb) TO service_role;

-- Every access point on a trip, as previewItinerary (src/lib/trip-itinerary.ts)
-- builds it for a review: {stops: {<id>: point}, days: {<date>: {point, stop_id}}},
-- with only the stops and days that have one.
CREATE FUNCTION public.trip_access_points(p_trip_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'stops', coalesce((SELECT jsonb_object_agg(s.id, s.access_point) FROM public.trip_stops s
      WHERE s.trip_id = p_trip_id AND s.access_point IS NOT NULL), '{}'::jsonb),
    'days', coalesce((SELECT jsonb_object_agg(d.date, jsonb_build_object('point', d.access_point, 'stop_id', d.access_point_stop_id))
      FROM public.trip_days d WHERE d.trip_id = p_trip_id AND d.access_point IS NOT NULL), '{}'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.trip_access_points(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trip_access_points(uuid) TO service_role;

-- A reviewed itinerary edit (022) or copy (023). Its review says what happens
-- to each changed day's access point, so the save is refused (40001) when any
-- access point on the trip changed since; otherwise it runs the edit, which
-- makes its own checks. The trip is locked first, as the edit locks it, so
-- the check and the edit see the same trip.
CREATE FUNCTION public.edit_trip_itinerary_reviewed(
  p_trip_id uuid,
  p_user_id text,
  p_action text,
  p_payload jsonb,
  p_access_points jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  PERFORM 1 FROM public.trips WHERE id = p_trip_id FOR UPDATE;
  IF public.trip_access_points(p_trip_id) IS DISTINCT FROM p_access_points THEN
    RAISE EXCEPTION 'Access points changed. Review the change again.' USING ERRCODE = '40001';
  END IF;
  IF p_action = 'copy_day' THEN
    RETURN public.copy_trip_day(p_trip_id, p_user_id, p_payload);
  END IF;
  RETURN public.edit_trip_itinerary(p_trip_id, p_user_id, p_action, p_payload);
END;
$$;
REVOKE ALL ON FUNCTION public.edit_trip_itinerary_reviewed(uuid, text, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.edit_trip_itinerary_reviewed(uuid, text, text, jsonb, jsonb) TO service_role;
