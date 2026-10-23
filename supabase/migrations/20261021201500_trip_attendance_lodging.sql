-- #331: each person's attendance and their own lodging state for each night,
-- so two groups can stay in different places on the same night, people can
-- arrive late or leave early, and one person can move without changing anyone
-- else's plan. The rules are in docs/trip-stays.md.
--
-- Deploy the API first. It reads these tables once they exist and the
-- crew-wide trip_lodging_nights (017) until then, so either order of rollout
-- leaves the trip readable, but only this order keeps saves consistent.

-- Lets the tables below reference a person within their own trip only.
ALTER TABLE public.trip_members ADD CONSTRAINT trip_members_trip_id_id_key UNIQUE (trip_id, id);

-- No row: with the trip from its pre-trip night through its last night,
-- following the trip's dates, and taking part every day. The arrival night is
-- on the trip; the departure night isn't, as with a stay's check-in and
-- check-out. Explicit dates are kept, and flagged for review, when the trip's
-- dates change.
CREATE TABLE public.trip_member_attendance (
  trip_id uuid NOT NULL,
  member_id uuid NOT NULL,
  arrival_date date,
  departure_date date,
  -- Days they're there but not taking part in the day's plan, such as an
  -- evening arrival. Their lodging that night is unaffected.
  skipped_dates date[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, member_id),
  FOREIGN KEY (trip_id, member_id) REFERENCES public.trip_members(trip_id, id) ON DELETE CASCADE,
  CHECK (arrival_date IS NULL OR departure_date IS NULL OR arrival_date <= departure_date),
  CHECK (cardinality(skipped_dates) <= 366)
);
CREATE TRIGGER update_trip_member_attendance_updated_at BEFORE UPDATE ON public.trip_member_attendance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- One lodging state per person and night. No row is Not planned; a night
-- outside the person's attendance is Not on trip, whatever is saved for it.
-- Rows outside it are kept only when the trip's dates change, for review.
CREATE TABLE public.trip_member_lodging_nights (
  trip_id uuid NOT NULL,
  member_id uuid NOT NULL,
  date date NOT NULL,
  stay_id uuid,
  status text NOT NULL CHECK (status IN ('assigned', 'no_stay')),
  PRIMARY KEY (trip_id, member_id, date),
  FOREIGN KEY (trip_id, member_id) REFERENCES public.trip_members(trip_id, id) ON DELETE CASCADE,
  FOREIGN KEY (trip_id, stay_id) REFERENCES public.trip_stays(trip_id, id) ON DELETE CASCADE,
  CHECK ((status = 'assigned' AND stay_id IS NOT NULL) OR (status = 'no_stay' AND stay_id IS NULL))
);
CREATE INDEX trip_member_lodging_nights_stay ON public.trip_member_lodging_nights(trip_id, stay_id);

-- Each crew night goes to the people the crew is known to be: joined accounts
-- (the organizer included) and managed guests. Pending invitations haven't
-- said they're coming, so they start Not planned, as anyone invited later
-- does. Stays, their dates, booking status and notes are unchanged.
INSERT INTO public.trip_member_lodging_nights (trip_id, member_id, date, stay_id, status)
  SELECT night.trip_id, member.id, night.date, night.stay_id, night.status
  FROM public.trip_lodging_nights night
  JOIN public.trip_members member ON member.trip_id = night.trip_id AND member.status IN ('joined', 'guest');
COMMENT ON TABLE public.trip_lodging_nights IS
  'Superseded by trip_member_lodging_nights (#331), which it was copied to. The API reads it only while the per-person tables don''t exist, before this migration; kept for audit and an API rollback.';

ALTER TABLE public.trip_member_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_member_lodging_nights ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trip_member_attendance, public.trip_member_lodging_nights FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.trip_member_attendance, public.trip_member_lodging_nights TO service_role;

-- Who's on the crew, as a save last saw it. A save sends the key its review
-- showed, so someone joining or being removed meanwhile is a conflict to
-- review rather than a change applied unseen. src/lib/trip-lodging.ts makes
-- the same key.
CREATE FUNCTION public.trip_lodging_people_key(p_trip_id uuid) RETURNS text
  LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT md5(coalesce(string_agg(id::text || ':' || status::text, ',' ORDER BY id), ''))
  FROM public.trip_members WHERE trip_id = p_trip_id
$$;

-- Each current person's nights on the trip: first_night up to, not including, after_last.
CREATE FUNCTION public.trip_lodging_windows(p_trip_id uuid)
  RETURNS TABLE (member_id uuid, member_status text, first_night date, after_last date)
  LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT member.id, member.status::text,
    coalesce(attendance.arrival_date, trip.start_date - 1),
    coalesce(attendance.departure_date, trip.end_date + 1)
  FROM public.trip_members member
  JOIN public.trips trip ON trip.id = member.trip_id
  LEFT JOIN public.trip_member_attendance attendance ON attendance.trip_id = member.trip_id AND attendance.member_id = member.id
  WHERE member.trip_id = p_trip_id AND member.status <> 'left'
$$;
REVOKE ALL ON FUNCTION public.trip_lodging_people_key(uuid), public.trip_lodging_windows(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trip_lodging_people_key(uuid), public.trip_lodging_windows(uuid) TO service_role;

-- As in 025, per person. Actions:
-- - save: the stay record. Nights new to its dates go to its current
--   occupants, or the crew for a stay nobody has yet; nights it no longer
--   covers become Not planned. `occupants` instead sets exactly who stays
--   there for all its dates. Other edits never change a night.
-- - remove: the stay; its nights become Not planned.
-- - night: No stay needed or Not planned for the whole crew on one night.
-- - assign: the listed people and nights only.
-- - attendance: one person's dates; nights they leave become Not planned.
-- A night someone already has another plan for needs p_replace_nights.
CREATE OR REPLACE FUNCTION public.mutate_trip_lodging(
  p_trip_id uuid, p_user_id text, p_expected_revision integer,
  p_request_id uuid, p_action text, p_payload jsonb, p_replace_nights boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  current_trip public.trips;
  saved public.trip_stays;
  target public.trip_stays;
  target_id uuid;
  first_night date;
  checkout date;
  selected_date date;
  prior public.trip_lodging_mutations;
  request_hash text;
  response jsonb;
  range_changed boolean;
  explicit_occupants boolean;
  occupants uuid[];
  cells jsonb := '[]'::jsonb;
  cell_list jsonb[] := '{}';
  entry jsonb;
  person record;
  night date;
  nights date[];
  arrival date;
  departure date;
  skipped date[];
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
    RAISE EXCEPTION 'Lodging changed. Review the saved plan.' USING ERRCODE = 'PT409';
  END IF;
  -- Hold the crew as it is until this change commits, in the same order as
  -- update_trip_shared_gear: the trip, then its members by id. Joining,
  -- leaving and removal update or delete a member row without the trip lock,
  -- so they wait here; adding someone already waits for the trip lock.
  PERFORM id FROM public.trip_members WHERE trip_id = p_trip_id ORDER BY id FOR SHARE;
  IF p_payload ? 'people_key' AND p_payload->>'people_key' IS DISTINCT FROM public.trip_lodging_people_key(p_trip_id) THEN
    RAISE EXCEPTION 'The crew changed. Review the saved plan.' USING ERRCODE = 'PT409';
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
      explicit_occupants := coalesce(jsonb_typeof(p_payload->'occupants') = 'array', false);
      IF explicit_occupants THEN
        occupants := ARRAY(SELECT DISTINCT value::uuid FROM jsonb_array_elements_text(p_payload->'occupants'));
        IF EXISTS (SELECT 1 FROM unnest(occupants) AS occupant(id) WHERE NOT EXISTS (
          SELECT 1 FROM public.trip_members WHERE trip_id = p_trip_id AND id = occupant.id AND status <> 'left')) THEN
          RAISE EXCEPTION 'Person not found' USING ERRCODE = '42501', HINT = 'member';
        END IF;
      ELSE
        occupants := ARRAY(SELECT DISTINCT member_id FROM public.trip_member_lodging_nights
          WHERE trip_id = p_trip_id AND stay_id = target_id);
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
      IF first_night IS NOT NULL AND (range_changed OR explicit_occupants) THEN
        -- Explicit occupants cover every night; otherwise only nights new to the range change.
        SELECT coalesce(jsonb_agg(jsonb_build_object('member_id', window_row.member_id, 'date', day::date, 'status', 'assigned', 'stay_id', target_id)), '[]'::jsonb)
          INTO cells
          FROM pg_catalog.generate_series(first_night::timestamp, (checkout - 1)::timestamp, interval '1 day') AS day
          JOIN public.trip_lodging_windows(p_trip_id) AS window_row ON day::date >= window_row.first_night AND day::date < window_row.after_last
          WHERE (explicit_occupants OR saved.check_in IS NULL OR day::date < saved.check_in OR day::date >= saved.check_out)
            AND (window_row.member_id = ANY(occupants)
              OR (NOT explicit_occupants AND cardinality(occupants) = 0 AND window_row.member_status IN ('joined', 'guest')));
      END IF;
      IF range_changed THEN
        DELETE FROM public.trip_member_lodging_nights WHERE trip_id = p_trip_id AND stay_id = target_id
          AND (first_night IS NULL OR date < first_night OR date >= checkout);
      END IF;
      IF explicit_occupants THEN
        DELETE FROM public.trip_member_lodging_nights WHERE trip_id = p_trip_id AND stay_id = target_id
          AND NOT (member_id = ANY(occupants));
      END IF;
    END IF;
  ELSIF p_action = 'night' THEN
    selected_date := (p_payload->>'date')::date;
    IF selected_date < current_trip.start_date - 1 OR selected_date > current_trip.end_date THEN
      RAISE EXCEPTION 'Night outside itinerary' USING ERRCODE = '22023', HINT = 'night';
    END IF;
    IF coalesce(p_payload->>'status', '') NOT IN ('no_stay', 'unplanned') THEN
      RAISE EXCEPTION 'Invalid night status' USING ERRCODE = '22023', HINT = 'night';
    END IF;
    -- The crew on the trip that night, and anyone already planned for it.
    SELECT coalesce(jsonb_agg(jsonb_build_object('member_id', window_row.member_id, 'date', selected_date, 'status', p_payload->>'status', 'stay_id', NULL)), '[]'::jsonb)
      INTO cells
      FROM public.trip_lodging_windows(p_trip_id) AS window_row
      WHERE selected_date >= window_row.first_night AND selected_date < window_row.after_last
        AND (window_row.member_status IN ('joined', 'guest') OR EXISTS (SELECT 1 FROM public.trip_member_lodging_nights saved_night
          WHERE saved_night.trip_id = p_trip_id AND saved_night.member_id = window_row.member_id AND saved_night.date = selected_date));
  ELSIF p_action = 'assign' THEN
    IF coalesce(jsonb_typeof(p_payload->'assignments'), '') <> 'array' OR jsonb_array_length(p_payload->'assignments') = 0 THEN
      RAISE EXCEPTION 'No assignments' USING ERRCODE = '22023', HINT = 'night';
    END IF;
    FOR entry IN SELECT value FROM jsonb_array_elements(p_payload->'assignments') LOOP
      SELECT * INTO person FROM public.trip_lodging_windows(p_trip_id) WHERE member_id = (entry->>'member_id')::uuid;
      IF NOT FOUND THEN RAISE EXCEPTION 'Person not found' USING ERRCODE = '42501', HINT = 'member'; END IF;
      IF coalesce(entry->>'status', '') NOT IN ('assigned', 'no_stay', 'unplanned') THEN
        RAISE EXCEPTION 'Invalid night status' USING ERRCODE = '22023', HINT = 'night';
      END IF;
      target := NULL;
      IF entry->>'status' = 'assigned' THEN
        SELECT * INTO target FROM public.trip_stays WHERE id = (entry->>'stay_id')::uuid AND trip_id = p_trip_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;
        IF target.check_in IS NULL THEN RAISE EXCEPTION 'Stay has no dates' USING ERRCODE = '22023', HINT = 'night'; END IF;
      END IF;
      IF jsonb_typeof(entry->'dates') = 'array' THEN
        nights := ARRAY(SELECT value::date FROM jsonb_array_elements_text(entry->'dates'));
      ELSIF target.id IS NOT NULL THEN
        -- Every night of the stay this person is on the trip.
        nights := ARRAY(SELECT day::date FROM pg_catalog.generate_series(target.check_in::timestamp, (target.check_out - 1)::timestamp, interval '1 day') AS day
          WHERE day::date >= person.first_night AND day::date < person.after_last);
      ELSE
        RAISE EXCEPTION 'Choose nights' USING ERRCODE = '22023', HINT = 'night';
      END IF;
      FOREACH night IN ARRAY nights LOOP
        IF night < person.first_night OR night >= person.after_last
          OR (target.id IS NOT NULL AND (night < target.check_in OR night >= target.check_out)) THEN
          RAISE EXCEPTION 'Night not available for this person' USING ERRCODE = '22023', HINT = 'night';
        END IF;
        IF cardinality(cell_list) >= 2000 THEN
          RAISE EXCEPTION 'Plan fewer nights at once' USING ERRCODE = '22023', HINT = 'night';
        END IF;
        cell_list := array_append(cell_list, jsonb_build_object('member_id', person.member_id, 'date', night, 'status', entry->>'status', 'stay_id', target.id));
      END LOOP;
    END LOOP;
    cells := to_jsonb(cell_list);
    IF (SELECT count(*) <> count(DISTINCT (cell->>'member_id') || '|' || (cell->>'date')) FROM jsonb_array_elements(cells) AS cell) THEN
      RAISE EXCEPTION 'A night is listed twice' USING ERRCODE = '22023', HINT = 'night';
    END IF;
  ELSIF p_action = 'attendance' THEN
    SELECT * INTO person FROM public.trip_lodging_windows(p_trip_id) WHERE member_id = (p_payload->>'member_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Person not found' USING ERRCODE = '42501', HINT = 'member'; END IF;
    arrival := (p_payload->>'arrival_date')::date;
    departure := (p_payload->>'departure_date')::date;
    skipped := ARRAY(SELECT DISTINCT value::date FROM jsonb_array_elements_text(coalesce(p_payload->'skipped_dates', '[]'::jsonb)) ORDER BY 1);
    IF arrival NOT BETWEEN current_trip.start_date - 1 AND current_trip.end_date
      OR departure NOT BETWEEN current_trip.start_date AND current_trip.end_date + 1
      OR coalesce(arrival, current_trip.start_date - 1) > coalesce(departure, current_trip.end_date + 1)
      OR EXISTS (SELECT 1 FROM unnest(skipped) AS day WHERE day < greatest(current_trip.start_date, arrival)
        OR day > least(current_trip.end_date, departure)) THEN
      RAISE EXCEPTION 'Invalid attendance' USING ERRCODE = '22023', HINT = 'attendance';
    END IF;
    -- Nights they had on the trip that the new dates don't include.
    SELECT coalesce(jsonb_agg(jsonb_build_object('member_id', person.member_id, 'date', saved_night.date, 'status', 'unplanned', 'stay_id', NULL)), '[]'::jsonb)
      INTO cells
      FROM public.trip_member_lodging_nights saved_night
      WHERE saved_night.trip_id = p_trip_id AND saved_night.member_id = person.member_id
        AND saved_night.date >= person.first_night AND saved_night.date < person.after_last
        AND (saved_night.date < coalesce(arrival, current_trip.start_date - 1) OR saved_night.date >= coalesce(departure, current_trip.end_date + 1));
    IF jsonb_array_length(cells) > 0 AND NOT p_replace_nights THEN
      RAISE EXCEPTION 'Review overlapping nights' USING ERRCODE = '23P01';
    END IF;
    IF arrival IS NULL AND departure IS NULL AND cardinality(skipped) = 0 THEN
      DELETE FROM public.trip_member_attendance WHERE trip_id = p_trip_id AND member_id = person.member_id;
    ELSE
      INSERT INTO public.trip_member_attendance (trip_id, member_id, arrival_date, departure_date, skipped_dates)
        VALUES (p_trip_id, person.member_id, arrival, departure, skipped)
        ON CONFLICT (trip_id, member_id) DO UPDATE SET arrival_date = EXCLUDED.arrival_date,
          departure_date = EXCLUDED.departure_date, skipped_dates = EXCLUDED.skipped_dates;
    END IF;
  ELSE RAISE EXCEPTION 'Invalid action' USING ERRCODE = '22023', HINT = 'night';
  END IF;

  -- A night someone already has another plan for. Clearing a night, as
  -- Not planned, replaces nothing, except when attendance clears it above.
  IF p_action <> 'attendance' AND NOT p_replace_nights AND EXISTS (
    SELECT 1 FROM jsonb_to_recordset(cells) AS cell(member_id uuid, date date, status text, stay_id uuid)
    JOIN public.trip_member_lodging_nights saved_night ON saved_night.trip_id = p_trip_id
      AND saved_night.member_id = cell.member_id AND saved_night.date = cell.date
    WHERE (cell.status = 'assigned' AND saved_night.stay_id IS DISTINCT FROM cell.stay_id)
      OR (cell.status = 'no_stay' AND saved_night.status = 'assigned')
  ) THEN
    RAISE EXCEPTION 'Review overlapping nights' USING ERRCODE = '23P01';
  END IF;
  DELETE FROM public.trip_member_lodging_nights saved_night
    USING jsonb_to_recordset(cells) AS cell(member_id uuid, date date, status text, stay_id uuid)
    WHERE cell.status = 'unplanned' AND saved_night.trip_id = p_trip_id
      AND saved_night.member_id = cell.member_id AND saved_night.date = cell.date;
  INSERT INTO public.trip_member_lodging_nights (trip_id, member_id, date, stay_id, status)
    SELECT p_trip_id, cell.member_id, cell.date, cell.stay_id, cell.status
    FROM jsonb_to_recordset(cells) AS cell(member_id uuid, date date, status text, stay_id uuid)
    WHERE cell.status <> 'unplanned'
    ON CONFLICT (trip_id, member_id, date) DO UPDATE SET stay_id = EXCLUDED.stay_id, status = EXCLUDED.status;

  UPDATE public.trips SET lodging_revision = lodging_revision + 1 WHERE id = p_trip_id;
  response := jsonb_build_object('revision', current_trip.lodging_revision + 1);
  INSERT INTO public.trip_lodging_mutations (trip_id, request_id, input_hash, result) VALUES (p_trip_id, p_request_id, request_hash, response);
  RETURN response;
END;
$$;
REVOKE ALL ON FUNCTION public.mutate_trip_lodging(uuid,text,integer,uuid,text,jsonb,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mutate_trip_lodging(uuid,text,integer,uuid,text,jsonb,boolean) TO service_role;

-- A trip date change needs the reviewed lodging revision whenever anyone has
-- a lodging plan or dates of their own, not only when the crew-wide nights
-- did. Only that check changes in change_trip_dates (026).
DO $migration$
DECLARE
  target oid;
  legacy constant text := 'OR EXISTS (SELECT 1 FROM public.trip_lodging_nights WHERE trip_id = p_trip_id))';
  replaced constant text := 'OR EXISTS (SELECT 1 FROM public.trip_member_lodging_nights WHERE trip_id = p_trip_id)'
    || ' OR EXISTS (SELECT 1 FROM public.trip_member_attendance WHERE trip_id = p_trip_id))';
  updated integer := 0;
BEGIN
  FOR target IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'change_trip_dates' AND strpos(p.prosrc, legacy) > 0
  LOOP
    EXECUTE replace(pg_get_functiondef(target), legacy, replaced);
    updated := updated + 1;
  END LOOP;
  IF updated = 0 THEN
    RAISE EXCEPTION 'change_trip_dates lodging check not found; apply 026 first';
  END IF;
END;
$migration$;

NOTIFY pgrst, 'reload schema';
