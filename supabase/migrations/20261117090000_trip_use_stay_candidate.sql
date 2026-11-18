-- Use for these nights (#213): an option becomes a stay only as it was
-- previewed. See docs/trip-stays.md#use-for-these-nights.
--
-- Apply this on its own, after 20261021201500 (per-person nights) and
-- 20261116200000 (stay options), before or after deploying the API. Until it's
-- applied the API checks the option's revision just before the lodging save,
-- outside its transaction; once it's applied the check and the save commit
-- together.

-- Saves the stay an option becomes (`p_payload` is mutate_trip_lodging's
-- 'save' payload, with the option's id) after checking, under the trip lock,
-- that the option is still at the revision its preview showed. An edit to the
-- option since then changes nothing (PT409, hint 'option'). A retry of a save
-- that already happened skips the check: mutate_trip_lodging returns its
-- first result, or refuses a reused identity with other input.
CREATE FUNCTION public.use_trip_stay_candidate(
  p_trip_id uuid,
  p_user_id text,
  p_expected_revision integer,
  p_request_id uuid,
  p_payload jsonb,
  p_replace_nights boolean,
  p_candidate_id uuid,
  p_candidate_revision integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  current_trip public.trips;
  v_revision integer;
BEGIN
  -- The trip first, as mutate_trip_lodging and mutate_trip_stay_candidate lock it.
  SELECT * INTO current_trip FROM public.trips WHERE id = p_trip_id FOR UPDATE;
  IF NOT FOUND OR p_user_id IS NULL OR current_trip.owner_user_id <> p_user_id THEN
    RAISE EXCEPTION 'Organizer only' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.trip_lodging_mutations WHERE trip_id = p_trip_id AND request_id = p_request_id) THEN
    IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR p_payload->>'id' IS DISTINCT FROM p_candidate_id::text THEN
      RAISE EXCEPTION 'Invalid option change' USING ERRCODE = '22023';
    END IF;
    SELECT revision INTO v_revision FROM public.trip_stay_candidates WHERE trip_id = p_trip_id AND id = p_candidate_id FOR UPDATE;
    IF NOT FOUND OR v_revision IS DISTINCT FROM p_candidate_revision THEN
      RAISE EXCEPTION 'Option changed. Review it again.' USING ERRCODE = 'PT409', HINT = 'option';
    END IF;
  END IF;
  RETURN public.mutate_trip_lodging(p_trip_id, p_user_id, p_expected_revision, p_request_id, 'save', p_payload, p_replace_nights);
END;
$$;
REVOKE ALL ON FUNCTION public.use_trip_stay_candidate(uuid, text, integer, uuid, jsonb, boolean, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.use_trip_stay_candidate(uuid, text, integer, uuid, jsonb, boolean, uuid, integer) TO service_role;

NOTIFY pgrst, 'reload schema';
