-- Change a saved trip's dates in one transaction (#176). See docs/trip-editing.md.
-- 'move' shifts every day, with its destination, activity and kits, by the
-- change in start date; the trip keeps its length. 'keep' leaves plans on their
-- calendar dates, adds the new dates and removes the dates outside the range.
-- An added date takes the destination of the nearest existing day.
--
-- Nothing is removed that wasn't reviewed: p_expected_removed is the preview's
-- list of removed days ({date, stop_id, activity, kit_ids}) and must match the
-- days that would be removed now. p_from_start/p_from_end are the dates the
-- preview was made for. Stays and their nights keep their own dates; when the
-- trip has lodging, p_lodging_revision must match the reviewed lodging plan.
CREATE FUNCTION public.change_trip_dates(
  p_trip_id uuid,
  p_user_id text,
  p_from_start date,
  p_from_end date,
  p_start date,
  p_end date,
  p_mode text,
  p_status public.trip_status,
  p_name text DEFAULT NULL,
  p_lodging_revision integer DEFAULT NULL,
  p_expected_removed jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  current_trip public.trips;
  saved public.trips;
  shift integer := 0;
  removed jsonb;
  expected jsonb := coalesce(p_expected_removed, '[]'::jsonb);
  day_row record;
BEGIN
  SELECT * INTO current_trip FROM public.trips WHERE id = p_trip_id FOR UPDATE;
  IF NOT FOUND OR p_user_id IS NULL OR (current_trip.owner_user_id <> p_user_id AND NOT EXISTS (
    SELECT 1 FROM public.trip_members
      WHERE trip_id = p_trip_id AND user_id = p_user_id AND status <> 'left'
  )) THEN
    RAISE EXCEPTION 'Not found' USING ERRCODE = '42501';
  END IF;

  -- A retry of a change that already happened returns the saved trip.
  IF current_trip.start_date = p_start AND current_trip.end_date = p_end THEN
    IF p_name IS NOT NULL AND p_name <> current_trip.name THEN
      UPDATE public.trips SET name = p_name WHERE id = p_trip_id RETURNING * INTO current_trip;
    END IF;
    RETURN jsonb_build_object('trip', to_jsonb(current_trip), 'changed', false);
  END IF;

  IF p_start IS NULL OR p_end IS NULL OR p_start > p_end OR p_end - p_start > 365
    OR p_mode IS NULL OR p_mode NOT IN ('move', 'keep') THEN
    RAISE EXCEPTION 'Invalid date change' USING ERRCODE = '22023';
  END IF;
  IF p_mode = 'move' THEN
    IF p_end - p_start <> current_trip.end_date - current_trip.start_date THEN
      RAISE EXCEPTION 'Moving keeps the trip length' USING ERRCODE = '22023';
    END IF;
    shift := p_start - current_trip.start_date;
  END IF;

  IF current_trip.start_date <> p_from_start OR current_trip.end_date <> p_from_end THEN
    RAISE EXCEPTION 'Trip dates changed. Review the saved trip.' USING ERRCODE = '40001';
  END IF;
  IF (EXISTS (SELECT 1 FROM public.trip_stays WHERE trip_id = p_trip_id)
      OR EXISTS (SELECT 1 FROM public.trip_lodging_nights WHERE trip_id = p_trip_id))
    AND p_lodging_revision IS DISTINCT FROM current_trip.lodging_revision THEN
    RAISE EXCEPTION 'Lodging changed. Review the stays.' USING ERRCODE = '40001';
  END IF;

  -- Each day is listed once, so containment both ways means the lists match.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'date', d.date, 'stop_id', d.stop_id, 'activity', d.activity,
      'kit_ids', coalesce((SELECT jsonb_agg(k.id) FROM public.trip_member_day_kits k WHERE k.trip_day_id = d.id), '[]'::jsonb)
    )), '[]'::jsonb)
    INTO removed
    FROM public.trip_days d
    WHERE d.trip_id = p_trip_id AND (d.date + shift < p_start OR d.date + shift > p_end);
  IF jsonb_typeof(expected) <> 'array' OR NOT (removed @> expected AND expected @> removed) THEN
    RAISE EXCEPTION 'Days to remove changed. Review the saved trip.' USING ERRCODE = '40001';
  END IF;

  IF p_mode = 'move' THEN
    DELETE FROM public.trip_days
      WHERE trip_id = p_trip_id AND (date + shift < p_start OR date + shift > p_end);
    -- One row at a time, from the end that moves first, so no two days ever
    -- share a date.
    FOR day_row IN
      SELECT id, date FROM public.trip_days WHERE trip_id = p_trip_id
        ORDER BY CASE WHEN shift > 0 THEN date END DESC, CASE WHEN shift < 0 THEN date END ASC
    LOOP
      UPDATE public.trip_days SET date = day_row.date + shift WHERE id = day_row.id;
    END LOOP;
  END IF;

  -- The subquery reads the days as they were before this insert, so every new
  -- date takes its destination from an existing day.
  INSERT INTO public.trip_days (trip_id, date, stop_id)
    SELECT p_trip_id, day::date, (
      SELECT d.stop_id FROM public.trip_days d WHERE d.trip_id = p_trip_id
        ORDER BY abs(d.date - day::date), d.date LIMIT 1
    )
    FROM pg_catalog.generate_series(p_start::timestamp, p_end::timestamp, interval '1 day') AS day
    WHERE NOT EXISTS (SELECT 1 FROM public.trip_days WHERE trip_id = p_trip_id AND date = day::date);

  IF p_mode = 'keep' THEN
    DELETE FROM public.trip_days WHERE trip_id = p_trip_id AND (date < p_start OR date > p_end);
  END IF;

  UPDATE public.trips
    SET start_date = p_start, end_date = p_end, status = p_status, name = coalesce(p_name, name)
    WHERE id = p_trip_id
    RETURNING * INTO saved;
  RETURN jsonb_build_object('trip', to_jsonb(saved), 'changed', true);
END;
$$;

-- The API checks the Clerk identity and calls this with the service-role client.
REVOKE ALL ON FUNCTION public.change_trip_dates(uuid, text, date, date, date, date, text, public.trip_status, text, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.change_trip_dates(uuid, text, date, date, date, date, text, public.trip_status, text, integer, jsonb) TO service_role;
