-- A Backcountry day's tour plan (#210). See docs/trip-tour-plans.md.
--
-- One plan per trip day, so it moves with its day when trip dates move and a
-- day's activity change keeps it (the day page offers Restore). The trailhead
-- and meeting point are not stored here: they come from the destination's
-- access point (#208). Times are wall-clock times at the destination, in the
-- IANA time zone the server found for it when the plan was saved.
--
-- All writes run through one service-only transaction, serialised on the trip
-- row, organizer only and revision checked, with replay receipts like
-- mutate_trip_lodging (017).

-- Lets a plan's composite key prove its day belongs to the same trip.
ALTER TABLE public.trip_days ADD CONSTRAINT trip_days_trip_id_id_key UNIQUE (trip_id, id);

CREATE TABLE public.trip_day_tour_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  trip_day_id uuid NOT NULL UNIQUE,
  objective varchar(200) NOT NULL CHECK (length(btrim(objective)) > 0),
  route_url varchar(2000),
  -- A meet the evening before (a hut approach) is -1.
  meet_time time,
  meet_day_offset smallint NOT NULL DEFAULT 0 CHECK (meet_day_offset IN (-1, 0)),
  -- Crew-entered figures with their units, as entered; metrics_source names
  -- where they came from, and no source means the crew's own estimate.
  distance numeric(6, 1) CHECK (distance > 0),
  distance_unit text CHECK (distance_unit IN ('km', 'mi')),
  ascent integer CHECK (ascent BETWEEN 0 AND 30000),
  ascent_unit text CHECK (ascent_unit IN ('m', 'ft')),
  duration_minutes integer CHECK (duration_minutes BETWEEN 1 AND 4320),
  metrics_source varchar(200),
  metrics_source_url varchar(2000),
  approach_notes varchar(4000),
  access_notes varchar(4000),
  access_url varchar(2000),
  backup_plan varchar(4000),
  -- A return the next day (an overnight) is 1.
  return_time time,
  return_day_offset smallint NOT NULL DEFAULT 0 CHECK (return_day_offset IN (0, 1)),
  checkin_notes varchar(2000),
  pickup_notes varchar(2000),
  time_zone text,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by text NOT NULL,
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (trip_id, trip_day_id) REFERENCES public.trip_days(trip_id, id) ON DELETE CASCADE,
  CHECK ((distance IS NULL) = (distance_unit IS NULL)),
  CHECK ((ascent IS NULL) = (ascent_unit IS NULL)),
  CHECK (meet_time IS NULL OR return_time IS NULL
    OR date '2000-01-02' + return_day_offset + return_time > date '2000-01-02' + meet_day_offset + meet_time)
);
CREATE INDEX trip_day_tour_plans_trip ON public.trip_day_tour_plans(trip_id);
CREATE TRIGGER update_trip_day_tour_plans_updated_at BEFORE UPDATE ON public.trip_day_tour_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- An uncertain response can be retried with the same identity without replacing
-- work saved afterwards. A request identity may not be reused with other input.
CREATE TABLE public.trip_tour_plan_mutations (
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  input_hash text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, request_id)
);
ALTER TABLE public.trip_day_tour_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_tour_plan_mutations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trip_day_tour_plans, public.trip_tour_plan_mutations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.trip_day_tour_plans, public.trip_tour_plan_mutations TO service_role;

-- p_action 'save' writes p_payload's fields over the day's plan (adding one if
-- there's none); 'remove' deletes it. p_day_id is the day the editor opened
-- for: after a date change another day can hold p_date, and a mismatch is
-- 40001. p_expected_revision is the plan revision the editor started from, 0
-- for no plan; a mismatch is 40001 too. The time zone is the server's lookup,
-- so a retry that found another one still replays.
CREATE FUNCTION public.mutate_trip_tour_plan(
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
    RAISE EXCEPTION 'This date is another day now. Review the saved plan.' USING ERRCODE = '40001';
  END IF;
  SELECT * INTO saved FROM public.trip_day_tour_plans WHERE trip_day_id = v_day.id FOR UPDATE;
  IF p_expected_revision IS NULL OR coalesce(saved.revision, 0) <> p_expected_revision THEN
    RAISE EXCEPTION 'Tour plan changed. Review the saved plan.' USING ERRCODE = '40001';
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
      meet_time = EXCLUDED.meet_time, meet_day_offset = EXCLUDED.meet_day_offset, distance = EXCLUDED.distance,
      distance_unit = EXCLUDED.distance_unit, ascent = EXCLUDED.ascent, ascent_unit = EXCLUDED.ascent_unit,
      duration_minutes = EXCLUDED.duration_minutes, metrics_source = EXCLUDED.metrics_source,
      metrics_source_url = EXCLUDED.metrics_source_url, approach_notes = EXCLUDED.approach_notes,
      access_notes = EXCLUDED.access_notes, access_url = EXCLUDED.access_url, backup_plan = EXCLUDED.backup_plan,
      return_time = EXCLUDED.return_time, return_day_offset = EXCLUDED.return_day_offset,
      checkin_notes = EXCLUDED.checkin_notes, pickup_notes = EXCLUDED.pickup_notes, time_zone = EXCLUDED.time_zone,
      revision = t.revision + 1, updated_by = EXCLUDED.updated_by
    RETURNING * INTO saved;
    response := jsonb_build_object('revision', saved.revision);
  ELSE
    RAISE EXCEPTION 'Invalid tour plan change' USING ERRCODE = '22000';
  END IF;
  INSERT INTO public.trip_tour_plan_mutations (trip_id, request_id, input_hash, result)
    VALUES (p_trip_id, p_request_id, request_hash, response);
  RETURN response;
END;
$$;
REVOKE ALL ON FUNCTION public.mutate_trip_tour_plan(uuid, text, date, uuid, integer, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mutate_trip_tour_plan(uuid, text, date, uuid, integer, uuid, text, jsonb) TO service_role;

-- change_trip_dates (021) as before, except that a removed day with a tour plan
-- carries its plan's id and revision, so a plan added or changed after the
-- review isn't deleted unseen. Days without one compare exactly as they did
-- before this migration.
CREATE OR REPLACE FUNCTION public.change_trip_dates(
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
    ) || coalesce((SELECT jsonb_build_object('tour_plan_id', t.id, 'tour_plan_revision', t.revision) FROM public.trip_day_tour_plans t WHERE t.trip_day_id = d.id), '{}'::jsonb)
    ), '[]'::jsonb)
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
