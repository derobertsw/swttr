-- Day checks on Backcountry days (#212, part 2): "Tour and backup plan
-- reviewed" before leaving and "Transceiver check" at the trailhead. See
-- docs/trip-touring-prep.md.
--
-- Each person records their own checks for each tour day; the organizer also
-- records a managed guest's, and the entry says who saved it (recorded_by).
-- Entries are only ever added: recording a check and withdrawing it each add
-- one, and a person's latest entry for a check on a day is where it stands.
-- Each entry keeps what the check was recorded against (its context, built by
-- the app): the day's tour plan for a plan review, and the transceiver in the
-- person's packing list for a transceiver check. The app says when that has
-- changed since.
--
-- A transceiver is "replaced" when the one in the list is taken off it and
-- one is added again, so each touring equipment item now records when it was
-- added (added_at), set by a trigger rather than by update_trip_packing.
--
-- Deploy the API first, then apply this after 026, 027, 032 and
-- 20261020000407. Until it's applied, trips load without day checks and
-- recording one returns 503.

CREATE TABLE public.trip_day_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Orders a person's entries; created_at can't be trusted to differ.
  entry_number bigint GENERATED ALWAYS AS IDENTITY,
  trip_id uuid NOT NULL,
  trip_day_id uuid NOT NULL,
  -- Whose check it is: a member's own, or a managed guest's. Only
  -- record_trip_day_check writes here, and it checks the member is on the
  -- trip, so this doesn't need #331's unique (trip_id, id) on trip_members.
  trip_member_id uuid NOT NULL REFERENCES public.trip_members(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('plan_review', 'transceiver')),
  action text NOT NULL CHECK (action IN ('recorded', 'withdrawn')),
  -- Who saved the entry: the person, or the organizer for a managed guest.
  recorded_by text NOT NULL,
  -- What the check was recorded against. A withdrawal keeps the check's.
  context jsonb NOT NULL CHECK (jsonb_typeof(context) = 'object'),
  -- The tour plan's revision when a plan review was recorded.
  plan_revision integer,
  -- The destination's IANA zone when it was saved, to show its time there.
  time_zone varchar(64),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (trip_id, trip_day_id) REFERENCES public.trip_days(trip_id, id) ON DELETE CASCADE
);
CREATE INDEX trip_day_checks_trip ON public.trip_day_checks(trip_id);
CREATE INDEX trip_day_checks_person ON public.trip_day_checks(trip_day_id, trip_member_id, kind, entry_number);

-- An uncertain response can be retried with the same identity without
-- repeating it. A request identity may not be reused with other input.
CREATE TABLE public.trip_day_check_mutations (
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  input_hash text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, request_id)
);

ALTER TABLE public.trip_day_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_day_check_mutations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trip_day_checks, public.trip_day_check_mutations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.trip_day_checks, public.trip_day_check_mutations TO service_role;

-- When each touring equipment item (032) was put in the list: added_at is set
-- when an item becomes 'added', and kept while it stays added, whatever the
-- change that saved the row. Items added before this migration have none.
CREATE FUNCTION public.stamp_trip_member_equipment() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_id text;
  v_before jsonb;
BEGIN
  FOR v_id IN SELECT jsonb_object_keys(NEW.equipment) LOOP
    CONTINUE WHEN NEW.equipment->v_id->>'status' IS DISTINCT FROM 'added';
    v_before := CASE WHEN TG_OP = 'UPDATE' THEN OLD.equipment->v_id END;
    IF v_before->>'status' = 'added' THEN
      NEW.equipment := jsonb_set(NEW.equipment, ARRAY[v_id], CASE WHEN v_before ? 'added_at'
        THEN (NEW.equipment->v_id) || jsonb_build_object('added_at', v_before->'added_at')
        ELSE (NEW.equipment->v_id) - 'added_at' END);
    ELSE
      NEW.equipment := jsonb_set(NEW.equipment, ARRAY[v_id, 'added_at'], to_jsonb(now()));
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
CREATE TRIGGER stamp_trip_member_equipment BEFORE INSERT OR UPDATE OF equipment ON public.trip_member_packing
  FOR EACH ROW EXECUTE FUNCTION public.stamp_trip_member_equipment();
REVOKE ALL ON FUNCTION public.stamp_trip_member_equipment() FROM PUBLIC, anon, authenticated;

-- Records or withdraws one check for one person on a day. p_user_id saves it:
-- for their own member row, or as the organizer for a managed guest's
-- (otherwise 42501). Nobody records for another signed-in member or a pending
-- invitation. p_day_id is the day the page showed: after a date change another
-- day can hold p_date, and a mismatch is PT409. The day must be a Backcountry
-- day, by its own activity or its stop's first (PT409). p_expected_entry is
-- the person's latest entry for the check when the page read it, null for
-- none; a mismatch is PT409, so a second window can't undo the first's change
-- unseen. p_action:
-- - 'recorded' records it now, with p_context, what the app read it against.
--   Under the trip lock the context is built again in the same shape as the
--   app's dayCheckContext (src/lib/trip-day-checks.ts), and one that changed
--   since the app read it is PT409. A plan review needs a tour plan.
-- - 'withdrawn' undoes a recorded check (22000 without one), keeping its
--   context and plan revision.
-- The context is left out of the replay comparison, since the app builds it
-- again for a retry.
CREATE FUNCTION public.record_trip_day_check(
  p_trip_id uuid, p_user_id text, p_date date, p_day_id uuid, p_member_id uuid, p_kind text,
  p_expected_entry uuid, p_request_id uuid, p_action text, p_context jsonb DEFAULT NULL, p_time_zone text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  current_trip public.trips;
  v_member public.trip_members;
  v_day public.trip_days;
  v_stop public.trip_stops;
  v_plan public.trip_day_tour_plans;
  v_packing public.trip_member_packing;
  v_context jsonb;
  latest public.trip_day_checks;
  saved public.trip_day_checks;
  prior public.trip_day_check_mutations;
  request_hash text;
  response jsonb;
BEGIN
  SELECT * INTO current_trip FROM public.trips WHERE id = p_trip_id FOR UPDATE;
  IF NOT FOUND OR p_user_id IS NULL OR (current_trip.owner_user_id <> p_user_id AND NOT EXISTS (
    SELECT 1 FROM public.trip_members
      WHERE trip_id = p_trip_id AND user_id = p_user_id AND status <> 'left'
  )) THEN
    RAISE EXCEPTION 'Not on this trip' USING ERRCODE = '42501';
  END IF;
  request_hash := encode(sha256(convert_to(jsonb_build_object('user', p_user_id, 'date', p_date, 'day', p_day_id,
    'member', p_member_id, 'kind', p_kind, 'expected', p_expected_entry, 'action', p_action)::text, 'UTF8')), 'hex');
  SELECT * INTO prior FROM public.trip_day_check_mutations WHERE trip_id = p_trip_id AND request_id = p_request_id;
  IF FOUND THEN
    IF prior.input_hash <> request_hash THEN RAISE EXCEPTION 'Request identity reused' USING ERRCODE = '22023'; END IF;
    RETURN prior.result;
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('plan_review', 'transceiver')
    OR p_action IS NULL OR p_action NOT IN ('recorded', 'withdrawn')
    OR (p_action = 'recorded' AND jsonb_typeof(p_context) IS DISTINCT FROM 'object')
    OR char_length(p_time_zone) > 64 THEN
    RAISE EXCEPTION 'Invalid check' USING ERRCODE = '22000';
  END IF;

  SELECT * INTO v_member FROM public.trip_members
    WHERE trip_id = p_trip_id AND id = p_member_id AND status <> 'left' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Person not on the trip' USING ERRCODE = 'P0002'; END IF;
  IF v_member.user_id IS DISTINCT FROM p_user_id
    AND NOT (v_member.status = 'guest' AND current_trip.owner_user_id = p_user_id) THEN
    RAISE EXCEPTION 'Only your own checks, or a managed guest''s for the organizer' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_day FROM public.trip_days WHERE trip_id = p_trip_id AND date = p_date FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Day not found' USING ERRCODE = 'P0002'; END IF;
  IF p_day_id IS NULL OR v_day.id <> p_day_id THEN
    RAISE EXCEPTION 'This date is another day now. Check it again.' USING ERRCODE = 'PT409';
  END IF;
  -- The day's stop, or the base (the first stop) without one, as the day page reads it.
  SELECT * INTO v_stop FROM public.trip_stops WHERE trip_id = p_trip_id
    ORDER BY (id = v_day.stop_id) DESC NULLS LAST, position LIMIT 1 FOR SHARE;
  IF coalesce(v_day.activity, v_stop.activities[1]) IS DISTINCT FROM 'Backcountry' THEN
    RAISE EXCEPTION 'This isn''t a Backcountry day now.' USING ERRCODE = 'PT409';
  END IF;
  SELECT * INTO latest FROM public.trip_day_checks
    WHERE trip_day_id = v_day.id AND trip_member_id = v_member.id AND kind = p_kind
    ORDER BY entry_number DESC LIMIT 1;
  IF latest.id IS DISTINCT FROM p_expected_entry THEN
    RAISE EXCEPTION 'This check changed. Check it again.' USING ERRCODE = 'PT409';
  END IF;

  IF p_action = 'recorded' THEN
    IF p_kind = 'plan_review' THEN
      SELECT * INTO v_plan FROM public.trip_day_tour_plans WHERE trip_day_id = v_day.id FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'No tour plan to review' USING ERRCODE = 'PT409'; END IF;
      v_context := jsonb_build_object(
        'date', v_day.date::text,
        'plan', jsonb_build_object('objective', v_plan.objective, 'route_url', v_plan.route_url,
          'backup_plan', v_plan.backup_plan,
          'meet_time', to_char(v_plan.meet_time, 'HH24:MI'), 'meet_day_offset', v_plan.meet_day_offset,
          'return_time', to_char(v_plan.return_time, 'HH24:MI'), 'return_day_offset', v_plan.return_day_offset),
        -- The day's own access point while it's at the stop it was set for, otherwise the stop's (as in 031).
        'meeting_point', (SELECT jsonb_build_object('latitude', point->'latitude', 'longitude', point->'longitude')
          FROM (SELECT CASE WHEN v_day.access_point IS NOT NULL AND v_day.access_point_stop_id = v_stop.id
            THEN v_day.access_point ELSE v_stop.access_point END AS point) applied
          WHERE point IS NOT NULL));
    ELSE
      SELECT * INTO v_packing FROM public.trip_member_packing WHERE trip_member_id = v_member.id FOR SHARE;
      v_context := jsonb_build_object(
        'date', v_day.date::text,
        'transceiver', CASE WHEN v_packing.equipment->'transceiver'->>'status' = 'added'
          THEN jsonb_build_object('added_at', v_packing.equipment->'transceiver'->'added_at') END);
    END IF;
    IF p_context IS DISTINCT FROM v_context THEN
      RAISE EXCEPTION 'What this check covers changed. Check it again.' USING ERRCODE = 'PT409';
    END IF;
    INSERT INTO public.trip_day_checks (trip_id, trip_day_id, trip_member_id, kind, action, recorded_by, context, plan_revision, time_zone)
      VALUES (p_trip_id, v_day.id, v_member.id, p_kind, 'recorded', p_user_id, p_context, v_plan.revision, p_time_zone)
      RETURNING * INTO saved;
  ELSIF latest.id IS NULL OR latest.action <> 'recorded' THEN
    RAISE EXCEPTION 'No check to withdraw' USING ERRCODE = '22000';
  ELSE
    INSERT INTO public.trip_day_checks (trip_id, trip_day_id, trip_member_id, kind, action, recorded_by, context, plan_revision, time_zone)
      VALUES (p_trip_id, v_day.id, v_member.id, p_kind, 'withdrawn', p_user_id, latest.context, latest.plan_revision,
        coalesce(p_time_zone, latest.time_zone))
      RETURNING * INTO saved;
  END IF;
  response := jsonb_build_object('entry_id', saved.id);
  INSERT INTO public.trip_day_check_mutations (trip_id, request_id, input_hash, result)
    VALUES (p_trip_id, p_request_id, request_hash, response);
  RETURN response;
END;
$$;
REVOKE ALL ON FUNCTION public.record_trip_day_check(uuid, text, date, uuid, uuid, text, uuid, uuid, text, jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_trip_day_check(uuid, text, date, uuid, uuid, text, uuid, uuid, text, jsonb, text)
  TO service_role;

NOTIFY pgrst, 'reload schema';
