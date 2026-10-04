-- Create one complete draft in one transaction. A client-generated UUID survives
-- double submission, an uncertain response, Back and reload. Existing API callers
-- may omit it; the route then generates one. Replays never overwrite saved work.
CREATE FUNCTION public.create_trip_draft(
  p_trip_id uuid,
  p_owner_user_id text,
  p_name text,
  p_start_date date,
  p_end_date date,
  p_status public.trip_status,
  p_destination jsonb DEFAULT NULL,
  p_activity text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  saved public.trips;
  destination_id uuid;
BEGIN
  INSERT INTO public.trips (id, owner_user_id, name, start_date, end_date, status)
    VALUES (p_trip_id, p_owner_user_id, p_name, p_start_date, p_end_date, p_status)
    ON CONFLICT (id) DO NOTHING
    RETURNING * INTO saved;

  IF NOT FOUND THEN
    SELECT * INTO saved FROM public.trips
      WHERE id = p_trip_id AND owner_user_id = p_owner_user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Draft identity unavailable' USING ERRCODE = '42501';
    END IF;
    RETURN jsonb_build_object('trip', to_jsonb(saved), 'created', false);
  END IF;

  IF p_destination IS NOT NULL THEN
    INSERT INTO public.trip_stops (trip_id, position, name, latitude, longitude, activities)
      VALUES (saved.id, 0, p_destination->>'name', (p_destination->>'latitude')::numeric,
        (p_destination->>'longitude')::numeric,
        CASE WHEN p_activity IS NULL THEN ARRAY[]::text[] ELSE ARRAY[p_activity] END)
      RETURNING id INTO destination_id;
  END IF;

  INSERT INTO public.trip_days (trip_id, date, stop_id, activity)
    SELECT saved.id, day::date, destination_id, p_activity
    FROM pg_catalog.generate_series(p_start_date::timestamp, p_end_date::timestamp, interval '1 day') AS day;

  INSERT INTO public.trip_members (trip_id, user_id, display_name, role, status)
    VALUES (saved.id, p_owner_user_id, 'You', 'organizer', 'joined');
  RETURN jsonb_build_object('trip', to_jsonb(saved), 'created', true);
END;
$$;

-- Clerk identity is checked by the API using the service-role client. The
-- browser roles must never invoke a function accepting an owner id directly.
REVOKE ALL ON FUNCTION public.create_trip_draft(uuid, text, text, date, date, public.trip_status, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_trip_draft(uuid, text, text, date, date, public.trip_status, jsonb, text) TO service_role;
