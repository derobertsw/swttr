-- Starting points and your own drive estimates (#209). See docs/trip-locations.md.
--
-- A day's own starting point is used instead of the crew stay of the night
-- before: trip_days.origin, a place (is_trip_location). When it was picked
-- from a saved stay, origin_stay_id names the stay, and the stay's current
-- name and place are used while it exists; origin keeps the place, under the
-- stay's name, for when the stay is removed. Either way it stays the day's
-- starting point until the organizer resets it. trip_days.no_drive is No
-- drive planned: the day keeps its starting point and gets no estimate.
-- They're on the day, so moving the trip's dates (021) keeps them with it, as
-- it keeps the day's access point (027).
ALTER TABLE public.trip_days
  ADD COLUMN origin jsonb
    CONSTRAINT trip_days_origin_valid CHECK (origin IS NULL OR public.is_trip_location(origin)),
  ADD COLUMN origin_stay_id uuid REFERENCES public.trip_stays(id) ON DELETE SET NULL,
  ADD COLUMN no_drive boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT trip_days_origin_stay CHECK (origin_stay_id IS NULL OR origin IS NOT NULL);
CREATE INDEX trip_days_origin_stay_id_idx ON public.trip_days (origin_stay_id) WHERE origin_stay_id IS NOT NULL;

-- Your estimate: a one-way drive time the organizer entered for a day, for
-- when routing has none. pair_key names the origin and access point
-- coordinates and the mode it was entered for (src/lib/trip-drive.ts), so it's
-- the day's estimate only while the day's drive is still that pair. Saving it
-- for several days writes a row on each, with one entered_at. use_calculated
-- is the organizer's choice of the calculated estimate for the same pair;
-- both are kept. Rows go with their day, so they move with it too.
CREATE TABLE public.trip_drive_manual_estimates (
  trip_day_id uuid PRIMARY KEY REFERENCES public.trip_days(id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  pair_key varchar(500) NOT NULL,
  origin_label varchar(300) NOT NULL,
  destination_label varchar(300) NOT NULL,
  duration_seconds integer NOT NULL CHECK (duration_seconds BETWEEN 60 AND 86400),
  note varchar(200) CHECK (note IS NULL OR length(btrim(note)) > 0),
  use_calculated boolean NOT NULL DEFAULT false,
  entered_by text NOT NULL,
  entered_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trip_drive_manual_estimates_trip_id_idx ON public.trip_drive_manual_estimates (trip_id);

-- Read and written only by the server's service-role client, like 028's table.
ALTER TABLE public.trip_drive_manual_estimates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trip_drive_manual_estimates FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.trip_drive_manual_estimates TO service_role;

-- Sets a day's starting point and No drive planned, in one transaction.
-- Organizer only, like every logistics edit. p_payload:
-- - date: the day.
-- - origin: null to use the crew stay again, {stay_id} for a saved stay with
--   a place, or {location} for any place.
-- - no_drive: true for No drive planned.
-- - expected: the day as the editor showed it, {origin, origin_stay_id,
--   no_drive}. When the day or the picked stay no longer matches, nothing
--   changes and the error is 40001.
CREATE FUNCTION public.set_trip_day_origin(
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
  v_expected jsonb := p_payload->'expected';
  v_origin jsonb;
  v_stay_id uuid;
BEGIN
  SELECT * INTO current_trip FROM public.trips WHERE id = p_trip_id FOR UPDATE;
  IF NOT FOUND OR p_user_id IS NULL OR current_trip.owner_user_id <> p_user_id THEN
    RAISE EXCEPTION 'Organizer only' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR coalesce(jsonb_typeof(p_payload->'origin'), '') NOT IN ('null', 'object')
    OR jsonb_typeof(p_payload->'no_drive') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(v_expected) IS DISTINCT FROM 'object'
    OR jsonb_typeof(v_expected->'no_drive') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'Invalid starting point change' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_day FROM public.trip_days WHERE trip_id = p_trip_id AND date = (p_payload->>'date')::date;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found' USING ERRCODE = 'P0002'; END IF;
  IF v_day.origin IS DISTINCT FROM nullif(v_expected->'origin', 'null'::jsonb)
    OR v_day.origin_stay_id IS DISTINCT FROM (v_expected->>'origin_stay_id')::uuid
    OR v_day.no_drive IS DISTINCT FROM (v_expected->>'no_drive')::boolean THEN
    RAISE EXCEPTION 'Starting point changed. Review it again.' USING ERRCODE = '40001';
  END IF;

  IF p_payload->'origin' ? 'stay_id' THEN
    -- A stay from this trip that still has its place, as the editor offered it.
    SELECT * INTO v_stay FROM public.trip_stays
      WHERE trip_id = p_trip_id AND id = (p_payload->'origin'->>'stay_id')::uuid AND location IS NOT NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Stay changed. Review it again.' USING ERRCODE = '40001'; END IF;
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

  UPDATE public.trip_days SET origin = v_origin, origin_stay_id = v_stay_id, no_drive = (p_payload->>'no_drive')::boolean
    WHERE id = v_day.id;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.set_trip_day_origin(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_trip_day_origin(uuid, text, jsonb) TO service_role;

-- Saves, removes or chooses your estimate on one or more days, in one
-- transaction. Organizer only. p_action and p_payload:
-- - 'save': {estimate: {pair_key, origin_label, destination_label,
--   duration_seconds, note}, dates, clear}. Writes the estimate on each of
--   dates, entered now, and removes it from clear: days that shared it and
--   were unticked. A day keeps its choice of estimate while its pair does.
-- - 'remove': {dates}. Removes it from those days.
-- - 'prefer': {dates, use_calculated}. Uses the calculated estimate for the
--   same pair instead, or yours again. Both stay saved.
-- Every payload has expected: each day it touches as the editor showed it,
-- {date, entered_at, use_calculated}, with nulls for a day without one. When
-- any day no longer matches, nothing changes and the error is 40001.
CREATE FUNCTION public.set_trip_drive_estimate(
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
    OR jsonb_typeof(v_expected) IS DISTINCT FROM 'array'
    OR jsonb_typeof(v_dates) IS DISTINCT FROM 'array' OR jsonb_array_length(v_dates) = 0
    OR jsonb_typeof(v_clear) IS DISTINCT FROM 'array'
    OR (p_action <> 'save' AND jsonb_array_length(v_clear) > 0)
    OR (p_action = 'save' AND jsonb_typeof(v_estimate) IS DISTINCT FROM 'object')
    OR (p_action = 'prefer' AND jsonb_typeof(p_payload->'use_calculated') IS DISTINCT FROM 'boolean')
    -- A day is written or cleared, not both, and every day touched was reviewed.
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_dates) AS d JOIN jsonb_array_elements(v_clear) AS c ON d = c)
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_dates || v_clear) AS d
      WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_expected) AS e WHERE e->'date' = d)) THEN
    RAISE EXCEPTION 'Invalid estimate change' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_expected) LOOP
    SELECT id INTO v_day_id FROM public.trip_days WHERE trip_id = p_trip_id AND date = (v_item->>'date')::date;
    IF NOT FOUND THEN RAISE EXCEPTION 'Day changed. Review it again.' USING ERRCODE = '40001'; END IF;
    v_row := NULL;
    SELECT * INTO v_row FROM public.trip_drive_manual_estimates WHERE trip_day_id = v_day_id;
    IF (v_row.trip_day_id IS NULL) <> (nullif(v_item->'entered_at', 'null'::jsonb) IS NULL)
      OR v_row.entered_at IS DISTINCT FROM (v_item->>'entered_at')::timestamptz
      OR v_row.use_calculated IS DISTINCT FROM (v_item->>'use_calculated')::boolean THEN
      RAISE EXCEPTION 'Estimate changed. Review it again.' USING ERRCODE = '40001';
    END IF;
  END LOOP;

  IF p_action = 'save' THEN
    INSERT INTO public.trip_drive_manual_estimates AS saved
      (trip_day_id, trip_id, pair_key, origin_label, destination_label, duration_seconds, note, entered_by)
      SELECT d.id, p_trip_id, v_estimate->>'pair_key', v_estimate->>'origin_label', v_estimate->>'destination_label',
        (v_estimate->>'duration_seconds')::integer, nullif(btrim(v_estimate->>'note'), ''), p_user_id
      FROM public.trip_days d
      WHERE d.trip_id = p_trip_id AND to_jsonb(d.date::text) IN (SELECT value FROM jsonb_array_elements(v_dates))
    ON CONFLICT (trip_day_id) DO UPDATE SET pair_key = EXCLUDED.pair_key, origin_label = EXCLUDED.origin_label,
      destination_label = EXCLUDED.destination_label, duration_seconds = EXCLUDED.duration_seconds, note = EXCLUDED.note,
      use_calculated = saved.use_calculated AND saved.pair_key = EXCLUDED.pair_key,
      entered_by = EXCLUDED.entered_by, entered_at = now();
    DELETE FROM public.trip_drive_manual_estimates m USING public.trip_days d
      WHERE m.trip_day_id = d.id AND d.trip_id = p_trip_id
        AND to_jsonb(d.date::text) IN (SELECT value FROM jsonb_array_elements(v_clear));
  ELSIF p_action = 'remove' THEN
    DELETE FROM public.trip_drive_manual_estimates m USING public.trip_days d
      WHERE m.trip_day_id = d.id AND d.trip_id = p_trip_id
        AND to_jsonb(d.date::text) IN (SELECT value FROM jsonb_array_elements(v_dates));
  ELSE
    UPDATE public.trip_drive_manual_estimates m SET use_calculated = (p_payload->>'use_calculated')::boolean
      FROM public.trip_days d
      WHERE m.trip_day_id = d.id AND d.trip_id = p_trip_id
        AND to_jsonb(d.date::text) IN (SELECT value FROM jsonb_array_elements(v_dates));
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count <> jsonb_array_length(v_dates) THEN
      RAISE EXCEPTION 'Invalid estimate change' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.set_trip_drive_estimate(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_trip_drive_estimate(uuid, text, text, jsonb) TO service_role;
