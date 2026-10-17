-- Official conditions sources and personal review records for tour days
-- (#211). See docs/trip-conditions.md.
--
-- A source (an avalanche forecast, mountain weather or access information
-- link) is saved once on the trip and attached to the days it covers. Only the
-- organizer adds, changes or removes one. Removing it from a day removes the
-- attachment only, so the reviews recorded for it there are kept.
--
-- Reviews are per person, source and day, and only ever added to: recording a
-- review, correcting its note and withdrawing it each add an attributed entry,
-- and a person's latest entry is their current review. Each entry keeps the
-- day's plan as it was when the review was recorded (its context, built by the
-- app), so the app can say when the plan has changed since. Nobody records,
-- corrects or withdraws a review for anyone else.
--
-- All writes run through two service-only transactions, serialised on the trip
-- row, with replay receipts like mutate_trip_tour_plan (026). Needs 012 and
-- 026, whose unique (trip_id, id) on trip_days the attachments and reviews use
-- to prove their day belongs to the same trip.

CREATE TABLE public.trip_conditions_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('avalanche', 'weather', 'access')),
  name varchar(200) NOT NULL CHECK (length(btrim(name)) > 0),
  -- The forecast zone or area the source covers, as the organizer names it.
  region varchar(200),
  url varchar(2000) NOT NULL CHECK (url ~* '^https?://'),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by text NOT NULL,
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, id)
);
CREATE TRIGGER update_trip_conditions_sources_updated_at BEFORE UPDATE ON public.trip_conditions_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.trip_day_conditions_sources (
  trip_id uuid NOT NULL,
  trip_day_id uuid NOT NULL,
  source_id uuid NOT NULL,
  added_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_day_id, source_id),
  FOREIGN KEY (trip_id, trip_day_id) REFERENCES public.trip_days(trip_id, id) ON DELETE CASCADE,
  FOREIGN KEY (trip_id, source_id) REFERENCES public.trip_conditions_sources(trip_id, id) ON DELETE CASCADE
);
CREATE INDEX trip_day_conditions_sources_trip ON public.trip_day_conditions_sources(trip_id);

CREATE TABLE public.trip_conditions_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Orders a person's entries; created_at can't be trusted to differ.
  entry_number bigint GENERATED ALWAYS AS IDENTITY,
  trip_id uuid NOT NULL,
  trip_day_id uuid NOT NULL,
  source_id uuid NOT NULL,
  user_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('reviewed', 'corrected', 'withdrawn')),
  note varchar(1000),
  -- When the review was recorded. A correction or withdrawal keeps it, and the context, from the review.
  reviewed_at timestamptz NOT NULL,
  context jsonb NOT NULL CHECK (jsonb_typeof(context) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (trip_id, trip_day_id) REFERENCES public.trip_days(trip_id, id) ON DELETE CASCADE,
  FOREIGN KEY (trip_id, source_id) REFERENCES public.trip_conditions_sources(trip_id, id) ON DELETE CASCADE
);
CREATE INDEX trip_conditions_reviews_trip ON public.trip_conditions_reviews(trip_id);
CREATE INDEX trip_conditions_reviews_person ON public.trip_conditions_reviews(trip_day_id, source_id, user_id, entry_number);

-- An uncertain response can be retried with the same identity without
-- repeating it. A request identity may not be reused with other input.
CREATE TABLE public.trip_conditions_mutations (
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  input_hash text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, request_id)
);

ALTER TABLE public.trip_conditions_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_day_conditions_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_conditions_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_conditions_mutations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trip_conditions_sources, public.trip_day_conditions_sources, public.trip_conditions_reviews,
  public.trip_conditions_mutations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.trip_conditions_sources, public.trip_day_conditions_sources, public.trip_conditions_reviews,
  public.trip_conditions_mutations TO service_role;

-- The organizer's change to a day's sources. p_day_id is the day the editor
-- opened for: after a date change another day can hold p_date, and a mismatch
-- is 40001. p_action:
-- - 'add' saves p_payload ({category, name, region, url}) as a new source on
--   the trip and attaches it to the day.
-- - 'save' writes p_payload over p_source_id, which must be on the day at
--   p_expected_revision (otherwise 40001).
-- - 'remove' detaches p_source_id from the day at p_expected_revision. The
--   source and its reviews are kept.
CREATE FUNCTION public.mutate_trip_conditions_source(
  p_trip_id uuid, p_user_id text, p_date date, p_day_id uuid, p_source_id uuid, p_expected_revision integer,
  p_request_id uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  current_trip public.trips;
  v_day public.trip_days;
  saved public.trip_conditions_sources;
  prior public.trip_conditions_mutations;
  request_hash text;
  response jsonb;
BEGIN
  SELECT * INTO current_trip FROM public.trips WHERE id = p_trip_id FOR UPDATE;
  IF NOT FOUND OR p_user_id IS NULL OR current_trip.owner_user_id <> p_user_id THEN
    RAISE EXCEPTION 'Organizer only' USING ERRCODE = '42501';
  END IF;
  request_hash := encode(sha256(convert_to(jsonb_build_object('kind', 'source', 'user', p_user_id, 'date', p_date,
    'day', p_day_id, 'source', p_source_id, 'revision', p_expected_revision, 'action', p_action,
    'payload', coalesce(p_payload, '{}'::jsonb))::text, 'UTF8')), 'hex');
  SELECT * INTO prior FROM public.trip_conditions_mutations WHERE trip_id = p_trip_id AND request_id = p_request_id;
  IF FOUND THEN
    IF prior.input_hash <> request_hash THEN RAISE EXCEPTION 'Request identity reused' USING ERRCODE = '22023'; END IF;
    RETURN prior.result;
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('add', 'save', 'remove')
    OR (p_action <> 'remove' AND jsonb_typeof(p_payload) IS DISTINCT FROM 'object') THEN
    RAISE EXCEPTION 'Invalid source change' USING ERRCODE = '22000';
  END IF;

  SELECT * INTO v_day FROM public.trip_days WHERE trip_id = p_trip_id AND date = p_date;
  IF NOT FOUND THEN RAISE EXCEPTION 'Day not found' USING ERRCODE = 'P0002'; END IF;
  IF p_day_id IS NULL OR v_day.id <> p_day_id THEN
    RAISE EXCEPTION 'This date is another day now. Review its sources.' USING ERRCODE = '40001';
  END IF;

  IF p_action = 'add' THEN
    INSERT INTO public.trip_conditions_sources (trip_id, category, name, region, url, created_by, updated_by)
      VALUES (p_trip_id, p_payload->>'category', p_payload->>'name', p_payload->>'region', p_payload->>'url', p_user_id, p_user_id)
      RETURNING * INTO saved;
    INSERT INTO public.trip_day_conditions_sources (trip_id, trip_day_id, source_id, added_by)
      VALUES (p_trip_id, v_day.id, saved.id, p_user_id);
    response := jsonb_build_object('source_id', saved.id, 'revision', saved.revision);
  ELSE
    SELECT s.* INTO saved FROM public.trip_conditions_sources s
      JOIN public.trip_day_conditions_sources a ON a.source_id = s.id AND a.trip_day_id = v_day.id
      WHERE s.trip_id = p_trip_id AND s.id = p_source_id
      FOR UPDATE OF s;
    IF NOT FOUND OR p_expected_revision IS NULL OR saved.revision <> p_expected_revision THEN
      RAISE EXCEPTION 'Source changed. Review the day''s sources.' USING ERRCODE = '40001';
    END IF;
    IF p_action = 'save' THEN
      UPDATE public.trip_conditions_sources SET category = p_payload->>'category', name = p_payload->>'name',
        region = p_payload->>'region', url = p_payload->>'url', revision = revision + 1, updated_by = p_user_id
        WHERE id = saved.id
        RETURNING * INTO saved;
      response := jsonb_build_object('source_id', saved.id, 'revision', saved.revision);
    ELSE
      DELETE FROM public.trip_day_conditions_sources WHERE trip_day_id = v_day.id AND source_id = saved.id;
      response := jsonb_build_object('source_id', saved.id, 'revision', 0);
    END IF;
  END IF;
  INSERT INTO public.trip_conditions_mutations (trip_id, request_id, input_hash, result)
    VALUES (p_trip_id, p_request_id, request_hash, response);
  RETURN response;
END;
$$;
REVOKE ALL ON FUNCTION public.mutate_trip_conditions_source(uuid, text, date, uuid, uuid, integer, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mutate_trip_conditions_source(uuid, text, date, uuid, uuid, integer, uuid, text, jsonb)
  TO service_role;

-- A person's own review of a source on a day: the organizer or a current
-- member. p_expected_entry is the person's latest entry for the source and day
-- when they started, null for none; a mismatch is 40001, so a second window
-- can't undo the first's change unseen. p_action:
-- - 'reviewed' records a review now, with p_note and p_context, the day's plan
--   as the app read it.
-- - 'corrected' replaces the current review's note; 'withdrawn' withdraws it.
--   Both keep the review's time and context, and need a current review.
-- The source must be on the day. The context is left out of the replay
-- comparison, since the app builds it again for a retry.
CREATE FUNCTION public.record_trip_conditions_review(
  p_trip_id uuid, p_user_id text, p_date date, p_day_id uuid, p_source_id uuid, p_expected_entry uuid,
  p_request_id uuid, p_action text, p_note text DEFAULT NULL, p_context jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  current_trip public.trips;
  v_day public.trip_days;
  latest public.trip_conditions_reviews;
  saved public.trip_conditions_reviews;
  prior public.trip_conditions_mutations;
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
  request_hash := encode(sha256(convert_to(jsonb_build_object('kind', 'review', 'user', p_user_id, 'date', p_date,
    'day', p_day_id, 'source', p_source_id, 'expected', p_expected_entry, 'action', p_action, 'note', p_note)::text,
    'UTF8')), 'hex');
  SELECT * INTO prior FROM public.trip_conditions_mutations WHERE trip_id = p_trip_id AND request_id = p_request_id;
  IF FOUND THEN
    IF prior.input_hash <> request_hash THEN RAISE EXCEPTION 'Request identity reused' USING ERRCODE = '22023'; END IF;
    RETURN prior.result;
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('reviewed', 'corrected', 'withdrawn')
    OR (p_action = 'reviewed' AND jsonb_typeof(p_context) IS DISTINCT FROM 'object') THEN
    RAISE EXCEPTION 'Invalid review change' USING ERRCODE = '22000';
  END IF;

  SELECT * INTO v_day FROM public.trip_days WHERE trip_id = p_trip_id AND date = p_date;
  IF NOT FOUND THEN RAISE EXCEPTION 'Day not found' USING ERRCODE = 'P0002'; END IF;
  IF p_day_id IS NULL OR v_day.id <> p_day_id OR NOT EXISTS (
    SELECT 1 FROM public.trip_day_conditions_sources WHERE trip_day_id = v_day.id AND source_id = p_source_id
  ) THEN
    RAISE EXCEPTION 'This day''s sources changed. Review them again.' USING ERRCODE = '40001';
  END IF;
  SELECT * INTO latest FROM public.trip_conditions_reviews
    WHERE trip_day_id = v_day.id AND source_id = p_source_id AND user_id = p_user_id
    ORDER BY entry_number DESC LIMIT 1;
  IF latest.id IS DISTINCT FROM p_expected_entry THEN
    RAISE EXCEPTION 'Your review changed. Review it again.' USING ERRCODE = '40001';
  END IF;

  IF p_action = 'reviewed' THEN
    INSERT INTO public.trip_conditions_reviews (trip_id, trip_day_id, source_id, user_id, action, note, reviewed_at, context)
      VALUES (p_trip_id, v_day.id, p_source_id, p_user_id, 'reviewed', p_note, now(), p_context)
      RETURNING * INTO saved;
  ELSIF latest.id IS NULL OR latest.action = 'withdrawn' THEN
    RAISE EXCEPTION 'No review to change' USING ERRCODE = '22000';
  ELSE
    INSERT INTO public.trip_conditions_reviews (trip_id, trip_day_id, source_id, user_id, action, note, reviewed_at, context)
      VALUES (p_trip_id, v_day.id, p_source_id, p_user_id, p_action,
        CASE WHEN p_action = 'corrected' THEN p_note END, latest.reviewed_at, latest.context)
      RETURNING * INTO saved;
  END IF;
  response := jsonb_build_object('entry_id', saved.id);
  INSERT INTO public.trip_conditions_mutations (trip_id, request_id, input_hash, result)
    VALUES (p_trip_id, p_request_id, request_hash, response);
  RETURN response;
END;
$$;
REVOKE ALL ON FUNCTION public.record_trip_conditions_review(uuid, text, date, uuid, uuid, uuid, uuid, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_trip_conditions_review(uuid, text, date, uuid, uuid, uuid, uuid, text, text, jsonb)
  TO service_role;
