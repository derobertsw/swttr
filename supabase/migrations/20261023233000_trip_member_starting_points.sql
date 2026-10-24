-- Departures by origin, part 2 (#333): a starting point for one person on one
-- day, and the organizer's own estimate for each drive rather than each day.
-- See docs/trip-locations.md.
--
-- Deploy the API first, then apply this on its own, after 029, #331's
-- 20261021201500 and 20261023000200. Until it's applied, trips load without
-- per-person starting points, and saving one, or your own estimate, returns
-- 503. Once it's applied, an API from before this change gets 503 when it
-- saves your own estimate.

-- A person's own starting point for a day, used instead of the day's own
-- (trip_days.origin) and the stay they slept in. origin and origin_stay_id
-- work as they do on the day (029): a picked stay's name and place are used
-- while it exists, and kept in step below so its removal leaves the place.
-- origin null with no_drive is No drive planned from where they'd start
-- anyway. No row is the shared default.
CREATE TABLE public.trip_member_day_origins (
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  trip_day_id uuid NOT NULL,
  member_id uuid NOT NULL,
  origin jsonb CONSTRAINT trip_member_day_origins_origin_valid CHECK (origin IS NULL OR public.is_trip_location(origin)),
  origin_stay_id uuid,
  no_drive boolean NOT NULL DEFAULT false,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_day_id, member_id),
  FOREIGN KEY (trip_id, trip_day_id) REFERENCES public.trip_days(trip_id, id) ON DELETE CASCADE,
  FOREIGN KEY (trip_id, member_id) REFERENCES public.trip_members(trip_id, id) ON DELETE CASCADE,
  FOREIGN KEY (trip_id, origin_stay_id) REFERENCES public.trip_stays(trip_id, id) ON DELETE SET NULL (origin_stay_id),
  CHECK (origin_stay_id IS NULL OR origin IS NOT NULL),
  -- A row says something: a place of their own, or No drive planned.
  CHECK (origin IS NOT NULL OR no_drive)
);
CREATE INDEX trip_member_day_origins_trip_id_idx ON public.trip_member_day_origins (trip_id);
CREATE INDEX trip_member_day_origins_member_idx ON public.trip_member_day_origins (trip_id, member_id);
CREATE INDEX trip_member_day_origins_stay_idx ON public.trip_member_day_origins (trip_id, origin_stay_id) WHERE origin_stay_id IS NOT NULL;

ALTER TABLE public.trip_member_day_origins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trip_member_day_origins FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.trip_member_day_origins TO service_role;

-- A stay's new name or place reaches the people who start from it, as 029's
-- trigger does for days.
CREATE FUNCTION public.sync_trip_member_day_stay_origins() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  UPDATE public.trip_member_day_origins SET origin = jsonb_set(coalesce(NEW.location, origin), '{label}', to_jsonb(NEW.name))
    WHERE trip_id = NEW.trip_id AND origin_stay_id = NEW.id;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_trip_member_day_stay_origins() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER sync_trip_member_day_stay_origins AFTER UPDATE OF name, location ON public.trip_stays
  FOR EACH ROW WHEN (OLD.name IS DISTINCT FROM NEW.name OR OLD.location IS DISTINCT FROM NEW.location)
  EXECUTE FUNCTION public.sync_trip_member_day_stay_origins();

-- Sets the same starting point for chosen people on one day, in one
-- transaction. Organizer only. p_payload:
-- - date: the day.
-- - member_ids: the people, all on the trip (not left).
-- - origin: null for where they'd start anyway, {stay_id} for a saved stay
--   with a place, or {location} for any place.
-- - no_drive: true for No drive planned.
-- - expected: each person as the editor showed them, {member_id, origin,
--   origin_stay_id, no_drive}, nulls and false without a row of their own.
-- origin null without no_drive removes their rows: back to the shared
-- default. Anything that no longer matches changes nothing (PT409).
CREATE FUNCTION public.set_trip_member_day_origins(
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
  v_stay public.trip_stays;
  v_members uuid[];
  v_item jsonb;
  v_row public.trip_member_day_origins;
  v_origin jsonb;
  v_stay_id uuid;
  v_no_drive boolean;
BEGIN
  SELECT * INTO current_trip FROM public.trips WHERE id = p_trip_id FOR UPDATE;
  IF NOT FOUND OR p_user_id IS NULL OR current_trip.owner_user_id <> p_user_id THEN
    RAISE EXCEPTION 'Organizer only' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR coalesce(jsonb_typeof(p_payload->'origin'), '') NOT IN ('null', 'object')
    OR jsonb_typeof(p_payload->'no_drive') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_payload->'member_ids') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_payload->'member_ids') NOT BETWEEN 1 AND 200
    OR jsonb_typeof(p_payload->'expected') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid starting point change' USING ERRCODE = '22023';
  END IF;
  v_members := ARRAY(SELECT DISTINCT value::uuid FROM jsonb_array_elements_text(p_payload->'member_ids'));
  v_no_drive := (p_payload->>'no_drive')::boolean;
  IF cardinality(v_members) <> jsonb_array_length(p_payload->'member_ids')
    OR EXISTS (SELECT 1 FROM unnest(v_members) AS m WHERE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_payload->'expected') AS e WHERE (e->>'member_id')::uuid = m)) THEN
    RAISE EXCEPTION 'Invalid starting point change' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_day FROM public.trip_days WHERE trip_id = p_trip_id AND date = (p_payload->>'date')::date;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found' USING ERRCODE = 'P0002'; END IF;
  -- Members after the trip, in id order, as #331's lodging changes lock them.
  PERFORM id FROM public.trip_members WHERE trip_id = p_trip_id AND id = ANY(v_members) ORDER BY id FOR SHARE;
  IF (SELECT count(*) FROM public.trip_members WHERE trip_id = p_trip_id AND id = ANY(v_members) AND status <> 'left') <> cardinality(v_members) THEN
    RAISE EXCEPTION 'The crew changed. Review it again.' USING ERRCODE = 'PT409';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_payload->'expected') LOOP
    IF NOT (v_item->>'member_id')::uuid = ANY(v_members) THEN CONTINUE; END IF;
    v_row := NULL;
    SELECT * INTO v_row FROM public.trip_member_day_origins WHERE trip_day_id = v_day.id AND member_id = (v_item->>'member_id')::uuid;
    IF v_row.origin IS DISTINCT FROM nullif(v_item->'origin', 'null'::jsonb)
      OR v_row.origin_stay_id IS DISTINCT FROM (v_item->>'origin_stay_id')::uuid
      OR coalesce(v_row.no_drive, false) IS DISTINCT FROM coalesce((v_item->>'no_drive')::boolean, false) THEN
      RAISE EXCEPTION 'Starting point changed. Review it again.' USING ERRCODE = 'PT409';
    END IF;
  END LOOP;

  IF p_payload->'origin' ? 'stay_id' THEN
    SELECT * INTO v_stay FROM public.trip_stays
      WHERE trip_id = p_trip_id AND id = (p_payload->'origin'->>'stay_id')::uuid AND location IS NOT NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Stay changed. Review it again.' USING ERRCODE = 'PT409'; END IF;
    v_origin := jsonb_set(v_stay.location, '{label}', to_jsonb(v_stay.name));
    v_stay_id := v_stay.id;
  ELSIF p_payload->'origin' ? 'location' THEN
    v_origin := p_payload->'origin'->'location';
    IF NOT public.is_trip_location(v_origin) THEN
      RAISE EXCEPTION 'Invalid location' USING ERRCODE = '22023';
    END IF;
  ELSIF jsonb_typeof(p_payload->'origin') = 'object' THEN
    RAISE EXCEPTION 'Invalid starting point change' USING ERRCODE = '22023';
  END IF;

  IF v_origin IS NULL AND NOT v_no_drive THEN
    DELETE FROM public.trip_member_day_origins WHERE trip_day_id = v_day.id AND member_id = ANY(v_members);
  ELSE
    INSERT INTO public.trip_member_day_origins (trip_id, trip_day_id, member_id, origin, origin_stay_id, no_drive, updated_by)
      SELECT p_trip_id, v_day.id, m, v_origin, v_stay_id, v_no_drive, p_user_id FROM unnest(v_members) AS m
    ON CONFLICT (trip_day_id, member_id) DO UPDATE SET origin = EXCLUDED.origin, origin_stay_id = EXCLUDED.origin_stay_id,
      no_drive = EXCLUDED.no_drive, updated_by = EXCLUDED.updated_by, updated_at = now();
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.set_trip_member_day_origins(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_trip_member_day_origins(uuid, text, jsonb) TO service_role;

-- Your estimate (029) is now for a drive on a day rather than the day, so
-- the rental's and the hotel's departures can each have one. Existing rows
-- keep their pair. 029's function saved one per day; it's replaced by the
-- one below, and an older API calling it is told saving isn't available.
ALTER TABLE public.trip_drive_manual_estimates DROP CONSTRAINT trip_drive_manual_estimates_pkey;
ALTER TABLE public.trip_drive_manual_estimates ADD PRIMARY KEY (trip_day_id, pair_key);
DROP FUNCTION public.set_trip_drive_estimate(uuid, text, text, jsonb);

-- 029's set_trip_drive_estimate, per drive. p_action and p_payload:
-- - 'save': {estimate: {pair_key, origin_label, destination_label,
--   duration_seconds, note}, dates, clear}. Writes the estimate for its pair on
--   each of dates, entered now, and removes each {date, pair_key} in clear:
--   days that shared it and were unticked, or an estimate for an earlier drive
--   this one replaces.
-- - 'remove': {pair_key, dates}.
-- - 'prefer': {pair_key, dates, use_calculated}.
-- expected lists each {date, pair_key} it touches as the editor showed it,
-- {date, pair_key, entered_at, use_calculated}, nulls without one. Anything
-- that no longer matches changes nothing (PT409).
CREATE FUNCTION public.set_trip_drive_pair_estimate(
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
  v_expected jsonb := p_payload->'expected';
  v_dates jsonb := p_payload->'dates';
  v_clear jsonb := coalesce(p_payload->'clear', '[]'::jsonb);
  v_estimate jsonb := p_payload->'estimate';
  v_pair text := coalesce(p_payload->'estimate'->>'pair_key', p_payload->>'pair_key');
  v_touched jsonb;
  v_item jsonb;
  v_day_id uuid;
  v_row public.trip_drive_manual_estimates;
  v_count integer;
BEGIN
  SELECT * INTO current_trip FROM public.trips WHERE id = p_trip_id FOR UPDATE;
  IF NOT FOUND OR p_user_id IS NULL OR current_trip.owner_user_id <> p_user_id THEN
    RAISE EXCEPTION 'Organizer only' USING ERRCODE = '42501';
  END IF;
  IF coalesce(p_action, '') NOT IN ('save', 'remove', 'prefer')
    OR coalesce(v_pair, '') = ''
    OR jsonb_typeof(v_expected) IS DISTINCT FROM 'array'
    OR jsonb_typeof(v_dates) IS DISTINCT FROM 'array' OR jsonb_array_length(v_dates) = 0
    OR jsonb_typeof(v_clear) IS DISTINCT FROM 'array'
    OR (p_action <> 'save' AND jsonb_array_length(v_clear) > 0)
    OR (p_action = 'save' AND jsonb_typeof(v_estimate) IS DISTINCT FROM 'object')
    OR (p_action = 'prefer' AND jsonb_typeof(p_payload->'use_calculated') IS DISTINCT FROM 'boolean') THEN
    RAISE EXCEPTION 'Invalid estimate change' USING ERRCODE = '22023';
  END IF;
  -- Every {date, pair_key} touched, written or cleared but not both, was reviewed.
  v_touched := (SELECT coalesce(jsonb_agg(jsonb_build_object('date', d, 'pair_key', v_pair)), '[]'::jsonb) FROM jsonb_array_elements(v_dates) AS d);
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_clear) AS c
      WHERE jsonb_typeof(c->'date') IS DISTINCT FROM 'string' OR jsonb_typeof(c->'pair_key') IS DISTINCT FROM 'string')
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_touched) AS t JOIN jsonb_array_elements(v_clear) AS c ON t->'date' = c->'date' AND t->'pair_key' = c->'pair_key')
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_touched || v_clear) AS t
      WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_expected) AS e WHERE e->'date' = t->'date' AND e->'pair_key' = t->'pair_key')) THEN
    RAISE EXCEPTION 'Invalid estimate change' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_expected) LOOP
    SELECT id INTO v_day_id FROM public.trip_days WHERE trip_id = p_trip_id AND date = (v_item->>'date')::date;
    IF NOT FOUND THEN RAISE EXCEPTION 'Day changed. Review it again.' USING ERRCODE = 'PT409'; END IF;
    v_row := NULL;
    SELECT * INTO v_row FROM public.trip_drive_manual_estimates WHERE trip_day_id = v_day_id AND pair_key = v_item->>'pair_key';
    IF (v_row.trip_day_id IS NULL) <> (nullif(v_item->'entered_at', 'null'::jsonb) IS NULL)
      OR v_row.entered_at IS DISTINCT FROM (v_item->>'entered_at')::timestamptz
      OR v_row.use_calculated IS DISTINCT FROM (v_item->>'use_calculated')::boolean THEN
      RAISE EXCEPTION 'Estimate changed. Review it again.' USING ERRCODE = 'PT409';
    END IF;
  END LOOP;

  IF p_action = 'save' THEN
    INSERT INTO public.trip_drive_manual_estimates AS saved
      (trip_day_id, trip_id, pair_key, origin_label, destination_label, duration_seconds, note, entered_by)
      SELECT d.id, p_trip_id, v_pair, v_estimate->>'origin_label', v_estimate->>'destination_label',
        (v_estimate->>'duration_seconds')::integer, nullif(btrim(v_estimate->>'note'), ''), p_user_id
      FROM public.trip_days d
      WHERE d.trip_id = p_trip_id AND to_jsonb(d.date::text) IN (SELECT value FROM jsonb_array_elements(v_dates))
    ON CONFLICT (trip_day_id, pair_key) DO UPDATE SET origin_label = EXCLUDED.origin_label,
      destination_label = EXCLUDED.destination_label, duration_seconds = EXCLUDED.duration_seconds, note = EXCLUDED.note,
      entered_by = EXCLUDED.entered_by, entered_at = now();
    DELETE FROM public.trip_drive_manual_estimates m USING public.trip_days d, jsonb_array_elements(v_clear) AS c
      WHERE m.trip_day_id = d.id AND d.trip_id = p_trip_id AND to_jsonb(d.date::text) = c->'date' AND m.pair_key = c->>'pair_key';
  ELSIF p_action = 'remove' THEN
    DELETE FROM public.trip_drive_manual_estimates m USING public.trip_days d
      WHERE m.trip_day_id = d.id AND d.trip_id = p_trip_id AND m.pair_key = v_pair
        AND to_jsonb(d.date::text) IN (SELECT value FROM jsonb_array_elements(v_dates));
  ELSE
    UPDATE public.trip_drive_manual_estimates m SET use_calculated = (p_payload->>'use_calculated')::boolean
      FROM public.trip_days d
      WHERE m.trip_day_id = d.id AND d.trip_id = p_trip_id AND m.pair_key = v_pair
        AND to_jsonb(d.date::text) IN (SELECT value FROM jsonb_array_elements(v_dates));
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count <> jsonb_array_length(v_dates) THEN
      RAISE EXCEPTION 'Invalid estimate change' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.set_trip_drive_pair_estimate(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_trip_drive_pair_estimate(uuid, text, text, jsonb) TO service_role;
