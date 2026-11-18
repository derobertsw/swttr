-- Stays the organizer is considering (#213), and the drives worked out to
-- compare them. See docs/trip-stays.md#comparing-stays-213.
--
-- Apply this on its own, after 017, 025 (it uses is_trip_location) and 028,
-- before or after deploying the API that uses it. An API from before this
-- change never reads these tables. One from after it that runs without them
-- shows no options to compare and refuses (503) to save one; comparing saved
-- stays still works, it just calculates every drive again.

-- An option is separate from the trip's stays and nights: saving one never
-- assigns a night, sets anyone's starting point or records a booking, and
-- its dates may overlap any stay's. Its dates are the nights it's considered
-- for, and the nights its estimated cost covers.
CREATE TABLE public.trip_stay_candidates (
  id uuid PRIMARY KEY,
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  name varchar(200) NOT NULL CHECK (length(btrim(name)) > 0),
  check_in date,
  check_out date,
  address varchar(1000),
  property_url varchar(2000),
  notes varchar(2000),
  location jsonb CONSTRAINT trip_stay_candidates_location_valid CHECK (location IS NULL OR public.is_trip_location(location)),
  -- The organizer's own estimate of the total, never a live price.
  cost_amount numeric(12, 2) CHECK (cost_amount >= 0 AND cost_amount <= 10000000),
  cost_currency text CHECK (cost_currency ~ '^[A-Z]{3}$'),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, id),
  CHECK ((check_in IS NULL AND check_out IS NULL) OR
    (check_in IS NOT NULL AND check_out IS NOT NULL AND check_out > check_in AND check_out - check_in <= 366)),
  -- A cost is in one currency and for the option's nights.
  CHECK ((cost_amount IS NULL) = (cost_currency IS NULL)),
  CHECK (cost_amount IS NULL OR check_in IS NOT NULL)
);
CREATE INDEX trip_stay_candidates_trip ON public.trip_stay_candidates(trip_id);
CREATE TRIGGER update_trip_stay_candidates_updated_at BEFORE UPDATE ON public.trip_stay_candidates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Drives calculated for a comparison, by route_key (the pair, routing options
-- and closures avoided, as trip_drive_estimates keys them). They're kept
-- apart from the trip's own estimates, which list a day's earlier estimates
-- for review, so an option's drive never reads as one the crew had. Rows go
-- with the trip.
CREATE TABLE public.trip_stay_candidate_routes (
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  route_key text NOT NULL CHECK (length(route_key) <= 2000),
  origin_label text NOT NULL,
  destination_label text NOT NULL,
  status text NOT NULL CHECK (status IN ('ok', 'no_route')),
  duration_seconds integer CHECK (duration_seconds >= 0),
  distance_meters integer CHECK (distance_meters >= 0),
  calculated_at timestamptz NOT NULL,
  provider text NOT NULL,
  PRIMARY KEY (trip_id, route_key),
  CHECK ((status = 'ok' AND duration_seconds IS NOT NULL AND distance_meters IS NOT NULL)
    OR (status = 'no_route' AND duration_seconds IS NULL AND distance_meters IS NULL))
);

ALTER TABLE public.trip_stay_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_stay_candidate_routes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trip_stay_candidates, public.trip_stay_candidate_routes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.trip_stay_candidates, public.trip_stay_candidate_routes TO service_role;

-- Saves or removes an option. Organizer only, like every logistics edit.
-- p_action 'save', p_payload: the option's fields with its id, and
-- expected_revision: null for a new option, otherwise the revision the editor
-- opened. 'remove', p_payload: {id, expected_revision}.
-- A retry finds its own work done and returns it: the same option already
-- saved with the same fields, or one already removed. Anything else that
-- doesn't match the editor changes nothing (PT409).
CREATE FUNCTION public.mutate_trip_stay_candidate(
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
  saved public.trip_stay_candidates;
  v_id uuid;
  v_expected integer;
  v_check_in date;
  v_check_out date;
  v_location jsonb;
  v_amount numeric;
  same boolean;
BEGIN
  SELECT * INTO current_trip FROM public.trips WHERE id = p_trip_id FOR UPDATE;
  IF NOT FOUND OR p_user_id IS NULL OR current_trip.owner_user_id <> p_user_id THEN
    RAISE EXCEPTION 'Organizer only' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR jsonb_typeof(p_payload->'id') IS DISTINCT FROM 'string'
    OR coalesce(jsonb_typeof(p_payload->'expected_revision'), 'null') NOT IN ('null', 'number') THEN
    RAISE EXCEPTION 'Invalid option' USING ERRCODE = '22023';
  END IF;
  v_id := (p_payload->>'id')::uuid;
  v_expected := (p_payload->>'expected_revision')::integer;
  -- Another trip's option is never found, so its id can't be reused here.
  IF EXISTS (SELECT 1 FROM public.trip_stay_candidates WHERE id = v_id AND trip_id <> p_trip_id) THEN
    RAISE EXCEPTION 'Option not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO saved FROM public.trip_stay_candidates WHERE id = v_id AND trip_id = p_trip_id FOR UPDATE;

  IF p_action = 'remove' THEN
    -- Already gone: a retry, or someone else removed it. Either way it's removed.
    IF saved.id IS NULL THEN RETURN jsonb_build_object('id', v_id, 'removed', true); END IF;
    IF v_expected IS DISTINCT FROM saved.revision THEN
      RAISE EXCEPTION 'Option changed. Review it again.' USING ERRCODE = 'PT409';
    END IF;
    DELETE FROM public.trip_stay_candidates WHERE id = v_id;
    RETURN jsonb_build_object('id', v_id, 'removed', true);
  END IF;
  IF p_action IS DISTINCT FROM 'save' THEN RAISE EXCEPTION 'Invalid option change' USING ERRCODE = '22023'; END IF;

  v_check_in := (p_payload->>'check_in')::date;
  v_check_out := (p_payload->>'check_out')::date;
  v_location := CASE WHEN jsonb_typeof(p_payload->'location') = 'object' THEN p_payload->'location' END;
  v_amount := (p_payload->>'cost_amount')::numeric;

  IF saved.id IS NOT NULL THEN
    same := saved.name = p_payload->>'name'
      AND saved.check_in IS NOT DISTINCT FROM v_check_in AND saved.check_out IS NOT DISTINCT FROM v_check_out
      AND saved.address IS NOT DISTINCT FROM p_payload->>'address'
      AND saved.property_url IS NOT DISTINCT FROM p_payload->>'property_url'
      AND saved.notes IS NOT DISTINCT FROM p_payload->>'notes'
      AND saved.location IS NOT DISTINCT FROM v_location
      AND saved.cost_amount IS NOT DISTINCT FROM v_amount
      AND saved.cost_currency IS NOT DISTINCT FROM p_payload->>'cost_currency';
    IF v_expected IS DISTINCT FROM saved.revision THEN
      -- The same fields: this save already happened, so return it again.
      IF same THEN RETURN to_jsonb(saved); END IF;
      RAISE EXCEPTION 'Option changed. Review it again.' USING ERRCODE = 'PT409';
    END IF;
    IF same THEN RETURN to_jsonb(saved); END IF;
  ELSIF v_expected IS NOT NULL THEN
    -- The editor had a saved option that's been removed since.
    RAISE EXCEPTION 'Option not found' USING ERRCODE = 'P0002';
  ELSE
    IF (SELECT count(*) FROM public.trip_stay_candidates WHERE trip_id = p_trip_id) >= 30 THEN
      RAISE EXCEPTION 'Too many options' USING ERRCODE = '22023', HINT = 'limit';
    END IF;
  END IF;
  -- The same place for the same nights is already an option.
  IF EXISTS (SELECT 1 FROM public.trip_stay_candidates WHERE trip_id = p_trip_id AND id <> v_id
    AND lower(btrim(name)) = lower(btrim(p_payload->>'name'))
    AND lower(btrim(coalesce(address, ''))) = lower(btrim(coalesce(p_payload->>'address', '')))
    AND check_in IS NOT DISTINCT FROM v_check_in AND check_out IS NOT DISTINCT FROM v_check_out) THEN
    RAISE EXCEPTION 'Option already saved' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.trip_stay_candidates AS c (id, trip_id, name, check_in, check_out, address, property_url, notes, location, cost_amount, cost_currency)
  VALUES (v_id, p_trip_id, p_payload->>'name', v_check_in, v_check_out, p_payload->>'address', p_payload->>'property_url',
    p_payload->>'notes', v_location, v_amount, p_payload->>'cost_currency')
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, check_in = EXCLUDED.check_in, check_out = EXCLUDED.check_out,
    address = EXCLUDED.address, property_url = EXCLUDED.property_url, notes = EXCLUDED.notes, location = EXCLUDED.location,
    cost_amount = EXCLUDED.cost_amount, cost_currency = EXCLUDED.cost_currency, revision = c.revision + 1
  RETURNING * INTO saved;
  RETURN to_jsonb(saved);
END;
$$;
REVOKE ALL ON FUNCTION public.mutate_trip_stay_candidate(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mutate_trip_stay_candidate(uuid, text, text, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
