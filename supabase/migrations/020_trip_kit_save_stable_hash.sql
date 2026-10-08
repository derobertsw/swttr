-- Save to trip (#170): a retry repeats a save only if what the client sent is
-- the same. The server adds the new trip's status from its clock, so that's
-- left out of the comparison; the route takes no other input from the clock.
-- As in 019 otherwise. Existing grants on the function are kept.
CREATE OR REPLACE FUNCTION public.save_trip_kits(
  p_save_id uuid,
  p_user_id text,
  p_trip_id uuid,
  p_new_trip jsonb,
  p_days jsonb,
  p_replace jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  request_hash text;
  prior public.trip_kit_saves;
  current_trip public.trips;
  me public.trip_members;
  entry jsonb;
  entry_date date;
  day_row public.trip_days;
  existing public.trip_member_day_kits;
  saved_kit public.trip_member_day_kits;
  expected text;
  conflicts jsonb := '[]'::jsonb;
  kits jsonb := '[]'::jsonb;
  created boolean := false;
  response jsonb;
BEGIN
  IF p_user_id IS NULL OR p_days IS NULL OR jsonb_typeof(p_days) <> 'array' OR jsonb_array_length(p_days) = 0 THEN
    RAISE EXCEPTION 'Nothing to save' USING ERRCODE = '22023';
  END IF;
  -- The new trip's status comes from the server's clock, so a retry after
  -- midnight would differ in it: it's left out of the comparison.
  request_hash := encode(sha256(convert_to(jsonb_build_object('trip', p_trip_id, 'new_trip', p_new_trip - 'status',
    'days', p_days, 'replace', coalesce(p_replace, '{}'::jsonb))::text, 'UTF8')), 'hex');

  -- A duplicate request waits for the first, then finds its receipt.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_save_id::text, 0));
  SELECT * INTO prior FROM public.trip_kit_saves WHERE save_id = p_save_id;
  IF FOUND THEN
    IF prior.user_id <> p_user_id THEN
      RAISE EXCEPTION 'Save identity unavailable' USING ERRCODE = '42501';
    END IF;
    -- The trip was deleted after it was saved to.
    IF prior.trip_id IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = 'P0002'; END IF;
    IF prior.trip_id <> p_trip_id OR prior.input_hash <> request_hash THEN
      RAISE EXCEPTION 'Save identity reused' USING ERRCODE = '22023';
    END IF;
    RETURN prior.result || jsonb_build_object('replayed', true);
  END IF;

  IF p_new_trip IS NOT NULL THEN
    created := (public.create_trip_draft(p_trip_id, p_user_id, p_new_trip->>'name',
      (p_new_trip->>'start_date')::date, (p_new_trip->>'end_date')::date,
      (p_new_trip->>'status')::public.trip_status, nullif(p_new_trip->'destination', 'null'::jsonb),
      p_new_trip->>'activity')->>'created')::boolean;
  END IF;

  SELECT * INTO current_trip FROM public.trips WHERE id = p_trip_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO me FROM public.trip_members
    WHERE trip_id = p_trip_id AND user_id = p_user_id AND status <> 'left';
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found' USING ERRCODE = 'P0002'; END IF;

  FOR entry IN SELECT value FROM pg_catalog.jsonb_array_elements(p_days) LOOP
    entry_date := (entry->>'date')::date;
    IF entry_date IS NULL OR entry_date < current_trip.start_date OR entry_date > current_trip.end_date THEN
      RAISE EXCEPTION 'Date outside trip' USING ERRCODE = '22008';
    END IF;
    SELECT k.* INTO existing FROM public.trip_member_day_kits k
      JOIN public.trip_days d ON d.id = k.trip_day_id
      WHERE d.trip_id = p_trip_id AND d.date = entry_date AND k.trip_member_id = me.id
      FOR UPDATE OF k;
    IF FOUND AND (existing.outfit IS NOT NULL OR jsonb_array_length(existing.items) > 0) THEN
      expected := coalesce(p_replace, '{}'::jsonb)->>(entry_date::text);
      IF expected IS NULL OR existing.updated_at IS DISTINCT FROM expected::timestamptz THEN
        conflicts := conflicts || jsonb_build_array(jsonb_build_object('date', entry_date, 'kit', to_jsonb(existing)));
      END IF;
    END IF;
  END LOOP;
  IF jsonb_array_length(conflicts) > 0 THEN
    RETURN jsonb_build_object('status', 'conflict', 'trip', to_jsonb(current_trip), 'conflicts', conflicts);
  END IF;

  FOR entry IN SELECT value FROM pg_catalog.jsonb_array_elements(p_days) LOOP
    entry_date := (entry->>'date')::date;
    INSERT INTO public.trip_days (trip_id, date, activity) VALUES (p_trip_id, entry_date, entry->>'activity')
      ON CONFLICT (trip_id, date) DO UPDATE SET activity = coalesce(public.trip_days.activity, EXCLUDED.activity)
      RETURNING * INTO day_row;
    INSERT INTO public.trip_member_day_kits (trip_day_id, trip_member_id, effort, items, state, outfit, outfit_saved_at)
      VALUES (day_row.id, me.id, (entry->>'effort')::public.trip_effort, '[]'::jsonb, 'ok', entry->'outfit', now())
      ON CONFLICT (trip_day_id, trip_member_id) DO UPDATE SET effort = EXCLUDED.effort, items = EXCLUDED.items,
        state = EXCLUDED.state, outfit = EXCLUDED.outfit, outfit_saved_at = EXCLUDED.outfit_saved_at
      RETURNING * INTO saved_kit;
    kits := kits || jsonb_build_array(to_jsonb(saved_kit) || jsonb_build_object('date', entry_date));
  END LOOP;

  response := jsonb_build_object('status', 'saved', 'trip', to_jsonb(current_trip), 'created', created, 'kits', kits);
  INSERT INTO public.trip_kit_saves (save_id, trip_id, user_id, input_hash, result)
    VALUES (p_save_id, p_trip_id, p_user_id, request_hash, response);
  RETURN response;
END;
$$;
