-- A note on each trip day for everyone on the trip (#334): tickets, rentals,
-- parking, where to find each other. See docs/trip-workspace.md#day-notes.
--
-- Apply this on its own, before or after deploying the API that reads it. An
-- API from before this change never reads the column. An API from after it
-- that runs without it shows no notes, and refuses (503) to save them.

-- Plain text, trimmed by the API, never empty: no notes is null. It's on the
-- day, so moving the trip's dates (021) keeps it with the day, as it keeps the
-- day's meet time (20261024230000). Copy day (023, 030) copies the day's
-- destination and activity only, so it leaves it alone.
ALTER TABLE public.trip_days
  ADD COLUMN notes text CONSTRAINT trip_days_notes_length CHECK (char_length(notes) BETWEEN 1 AND 2000);

-- Sets or clears a day's notes. Organizer only, like every logistics edit.
-- p_payload:
-- - date and day_id: the day the editor opened for. After a date change
--   another day can hold the date.
-- - notes: the text, or null to clear them.
-- - expected: {notes} as the editor showed them.
-- When the day or its notes no longer match, nothing changes (PT409).
CREATE FUNCTION public.set_trip_day_notes(
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
BEGIN
  SELECT * INTO current_trip FROM public.trips WHERE id = p_trip_id FOR UPDATE;
  IF NOT FOUND OR p_user_id IS NULL OR current_trip.owner_user_id <> p_user_id THEN
    RAISE EXCEPTION 'Organizer only' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR coalesce(jsonb_typeof(p_payload->'notes'), '') NOT IN ('null', 'string')
    OR coalesce(char_length(p_payload->>'notes'), 1) NOT BETWEEN 1 AND 2000
    OR jsonb_typeof(v_expected) IS DISTINCT FROM 'object'
    OR coalesce(jsonb_typeof(v_expected->'notes'), '') NOT IN ('null', 'string') THEN
    RAISE EXCEPTION 'Invalid notes' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_day FROM public.trip_days WHERE trip_id = p_trip_id AND date = (p_payload->>'date')::date FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found' USING ERRCODE = 'P0002'; END IF;
  IF v_day.id IS DISTINCT FROM (p_payload->>'day_id')::uuid
    OR v_day.notes IS DISTINCT FROM v_expected->>'notes' THEN
    RAISE EXCEPTION 'Notes changed. Review them again.' USING ERRCODE = 'PT409';
  END IF;

  UPDATE public.trip_days SET notes = p_payload->>'notes' WHERE id = v_day.id;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.set_trip_day_notes(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_trip_day_notes(uuid, text, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
