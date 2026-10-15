-- A stay's confirmed place (#208). It is never the activity's weather
-- location. One shape, checked here and in src/lib/trip-location.ts, so the
-- access points that follow can reuse it.
CREATE FUNCTION public.is_trip_location(value jsonb) RETURNS boolean
  LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  latitude double precision;
  longitude double precision;
BEGIN
  -- IS DISTINCT FROM, so a missing key fails rather than giving NULL.
  IF jsonb_typeof(value) IS DISTINCT FROM 'object'
    OR jsonb_typeof(value->'label') IS DISTINCT FROM 'string'
    OR length(btrim(value->>'label')) NOT BETWEEN 1 AND 300
    OR jsonb_typeof(value->'latitude') IS DISTINCT FROM 'number'
    OR jsonb_typeof(value->'longitude') IS DISTINCT FROM 'number'
    OR coalesce(value->>'precision', '') NOT IN ('exact', 'approximate')
    OR coalesce(value->>'source', '') NOT IN ('search', 'manual') THEN
    RETURN false;
  END IF;
  latitude := (value->>'latitude')::double precision;
  longitude := (value->>'longitude')::double precision;
  -- 0, 0 is open ocean: a missing value, not a place anyone stays.
  IF latitude NOT BETWEEN -90 AND 90 OR longitude NOT BETWEEN -180 AND 180 OR (latitude = 0 AND longitude = 0) THEN
    RETURN false;
  END IF;
  -- Entered coordinates carry no provider data.
  IF value->>'source' = 'manual' AND (coalesce(value->>'provider', '') <> '' OR coalesce(value->>'provider_id', '') <> '') THEN
    RETURN false;
  END IF;
  RETURN coalesce(length(value->>'address'), 0) <= 1000
    AND coalesce(length(value->>'time_zone'), 0) <= 100
    AND coalesce(length(value->>'provider'), 0) <= 50
    AND coalesce(length(value->>'provider_id'), 0) <= 500
    AND coalesce(length(value->>'attribution'), 0) <= 300;
END;
$$;
REVOKE ALL ON FUNCTION public.is_trip_location(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_trip_location(jsonb) TO service_role;

ALTER TABLE public.trip_stays ADD COLUMN location jsonb
  CONSTRAINT trip_stays_location_valid CHECK (location IS NULL OR public.is_trip_location(location));

-- As in 017, plus the location. A save without a location key keeps the saved
-- one, so an editor opened before this change can't clear it.
CREATE OR REPLACE FUNCTION public.mutate_trip_lodging(
  p_trip_id uuid, p_user_id text, p_expected_revision integer,
  p_request_id uuid, p_action text, p_payload jsonb, p_replace_nights boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  current_trip public.trips;
  saved public.trip_stays;
  target_id uuid;
  first_night date;
  checkout date;
  selected_date date;
  prior public.trip_lodging_mutations;
  request_hash text;
  response jsonb;
  range_changed boolean;
BEGIN
  SELECT * INTO current_trip FROM public.trips WHERE id = p_trip_id FOR UPDATE;
  IF NOT FOUND OR current_trip.owner_user_id <> p_user_id OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Organizer only' USING ERRCODE = '42501';
  END IF;
  request_hash := encode(sha256(convert_to(jsonb_build_object('action', p_action, 'payload', p_payload, 'replace', p_replace_nights)::text, 'UTF8')), 'hex');
  SELECT * INTO prior FROM public.trip_lodging_mutations WHERE trip_id = p_trip_id AND request_id = p_request_id;
  IF FOUND THEN
    IF prior.input_hash <> request_hash THEN RAISE EXCEPTION 'Request identity reused' USING ERRCODE = '22023'; END IF;
    RETURN prior.result;
  END IF;
  IF p_expected_revision IS NULL OR current_trip.lodging_revision <> p_expected_revision THEN
    RAISE EXCEPTION 'Lodging changed. Review the saved plan.' USING ERRCODE = '40001';
  END IF;

  IF p_action IN ('save', 'remove') THEN
    target_id := (p_payload->>'id')::uuid;
    SELECT * INTO saved FROM public.trip_stays WHERE id = target_id;
    IF FOUND AND saved.trip_id <> p_trip_id THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;
    IF p_action = 'remove' THEN
      IF saved.id IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = 'P0002'; END IF;
      DELETE FROM public.trip_stays WHERE id = target_id AND trip_id = p_trip_id;
    ELSE
      -- PATCH must target an existing record; POST may safely retry an identity.
      IF (p_payload->>'existing')::boolean AND saved.id IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = 'P0002'; END IF;
      IF NOT (p_payload->>'existing')::boolean AND saved.id IS NOT NULL THEN RAISE EXCEPTION 'Stay identity already used' USING ERRCODE = '22023'; END IF;
      first_night := (p_payload->>'check_in')::date;
      checkout := (p_payload->>'check_out')::date;
      -- Look for the same property/dates before adding another record. A later
      -- visit with different dates remains valid, as do different addresses.
      IF EXISTS (SELECT 1 FROM public.trip_stays WHERE trip_id = p_trip_id AND id <> target_id
        AND lower(btrim(name)) = lower(btrim(p_payload->>'name'))
        AND lower(btrim(coalesce(address, ''))) = lower(btrim(coalesce(p_payload->>'address', '')))
        AND check_in IS NOT DISTINCT FROM first_night AND check_out IS NOT DISTINCT FROM checkout) THEN
        RAISE EXCEPTION 'Stay already saved' USING ERRCODE = '23505';
      END IF;
      range_changed := saved.id IS NULL OR saved.check_in IS DISTINCT FROM first_night OR saved.check_out IS DISTINCT FROM checkout;
      IF range_changed AND first_night IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.trip_lodging_nights WHERE trip_id = p_trip_id
          AND date >= first_night AND date < checkout AND (stay_id IS DISTINCT FROM target_id)
      ) AND NOT p_replace_nights THEN
        RAISE EXCEPTION 'Review overlapping nights' USING ERRCODE = '23P01';
      END IF;
      INSERT INTO public.trip_stays AS stay (id, trip_id, name, check_in, check_out, type, address, property_url,
        check_in_time, check_out_time, notes, booking_status, location)
      VALUES (target_id, p_trip_id, p_payload->>'name', first_night, checkout, p_payload->>'type',
        p_payload->>'address', p_payload->>'property_url', (p_payload->>'check_in_time')::time,
        (p_payload->>'check_out_time')::time, p_payload->>'notes', p_payload->>'booking_status',
        nullif(p_payload->'location', 'null'::jsonb))
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, check_in = EXCLUDED.check_in, check_out = EXCLUDED.check_out,
        type = EXCLUDED.type, address = EXCLUDED.address, property_url = EXCLUDED.property_url,
        check_in_time = EXCLUDED.check_in_time, check_out_time = EXCLUDED.check_out_time,
        notes = EXCLUDED.notes, booking_status = EXCLUDED.booking_status,
        location = CASE WHEN p_payload ? 'location' THEN EXCLUDED.location ELSE stay.location END;
      IF range_changed THEN
        DELETE FROM public.trip_lodging_nights WHERE trip_id = p_trip_id AND stay_id = target_id;
      END IF;
      IF range_changed AND first_night IS NOT NULL THEN
        INSERT INTO public.trip_lodging_nights (trip_id, date, stay_id, status)
          SELECT p_trip_id, day::date, target_id, 'assigned'
          FROM pg_catalog.generate_series(first_night::timestamp, (checkout - 1)::timestamp, interval '1 day') AS day
          ON CONFLICT (trip_id, date) DO UPDATE SET stay_id = EXCLUDED.stay_id, status = EXCLUDED.status;
      END IF;
    END IF;
  ELSIF p_action = 'night' THEN
    selected_date := (p_payload->>'date')::date;
    IF selected_date < current_trip.start_date - 1 OR selected_date > current_trip.end_date THEN
      RAISE EXCEPTION 'Night outside itinerary' USING ERRCODE = '22023';
    END IF;
    IF p_payload->>'status' = 'no_stay' THEN
      IF EXISTS (SELECT 1 FROM public.trip_lodging_nights WHERE trip_id = p_trip_id AND date = selected_date AND stay_id IS NOT NULL)
        AND NOT p_replace_nights THEN RAISE EXCEPTION 'Review overlapping nights' USING ERRCODE = '23P01'; END IF;
      INSERT INTO public.trip_lodging_nights (trip_id, date, status) VALUES (p_trip_id, selected_date, 'no_stay')
        ON CONFLICT (trip_id, date) DO UPDATE SET stay_id = NULL, status = 'no_stay';
    ELSIF p_payload->>'status' = 'unplanned' THEN
      DELETE FROM public.trip_lodging_nights WHERE trip_id = p_trip_id AND date = selected_date;
    ELSE RAISE EXCEPTION 'Invalid night status' USING ERRCODE = '22023';
    END IF;
  ELSE RAISE EXCEPTION 'Invalid action' USING ERRCODE = '22023';
  END IF;
  UPDATE public.trips SET lodging_revision = lodging_revision + 1 WHERE id = p_trip_id;
  response := jsonb_build_object('revision', current_trip.lodging_revision + 1);
  INSERT INTO public.trip_lodging_mutations (trip_id, request_id, input_hash, result) VALUES (p_trip_id, p_request_id, request_hash, response);
  RETURN response;
END;
$$;
REVOKE ALL ON FUNCTION public.mutate_trip_lodging(uuid,text,integer,uuid,text,jsonb,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mutate_trip_lodging(uuid,text,integer,uuid,text,jsonb,boolean) TO service_role;
