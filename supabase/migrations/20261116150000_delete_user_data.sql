-- Deletes an account's SWTTR data when Clerk deletes the account (#139).
-- POST /api/webhooks/clerk calls it for Clerk's user.deleted event. See
-- docs/account-deletion.md for what happens to each table, and why.
--
-- Apply this on its own, before deploying the API that calls it. Nothing else
-- calls it, so applying it early changes nothing. Until it's applied the
-- webhook answers 503 and Clerk retries the event.
--
-- It runs in one transaction: a failure part way through deletes nothing, and
-- Clerk's retry starts over. Running it again for the same account, or for an
-- account with no data, changes nothing and returns zero counts.
--
-- Tables the API reads only once their migration is in (trip_member_day_origins,
-- 20261023233000) are updated only when they exist, so this applies to prod as
-- it is.
CREATE FUNCTION public.delete_user_data(p_user_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  -- What the account's ID becomes where a trip it doesn't own keeps a record
  -- of who did something. The app shows an ID that matches no member as
  -- "a former crew member", and this never matches a Clerk ID.
  v_anonymous constant text := 'deleted-account';
  v_counts jsonb := '{}'::jsonb;
  v_rows integer;
  v_anonymized integer := 0;
BEGIN
  IF p_user_id IS NULL OR p_user_id !~ '^user_[A-Za-z0-9]+$' THEN
    RAISE EXCEPTION 'Not a Clerk user ID' USING ERRCODE = '22023';
  END IF;

  -- Trip writers hold the trip before a member's row (20261018131917), so hold
  -- the trips they're a member of first, in a fixed order.
  PERFORM 1 FROM public.trips
    WHERE id IN (SELECT trip_id FROM public.trip_members WHERE user_id = p_user_id)
    ORDER BY id FOR UPDATE;

  -- Trips they own, for the whole crew. Everything on a trip goes with it
  -- through ON DELETE CASCADE, and receipts of kit saves to it keep no result
  -- (019).
  DELETE FROM public.trips WHERE owner_user_id = p_user_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('trips', v_rows);

  -- Their place on other people's trips. Their kits, packing list, attendance,
  -- nights, starting points, day checks and nudges go with it, and shared gear
  -- they were bringing goes back to the organizer to reassign
  -- (release_member_shared_gear), as when the organizer removes someone.
  DELETE FROM public.trip_members WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('trip_memberships', v_rows);

  -- Their own conditions reviews and notes on those trips, which are theirs
  -- rather than the crew's.
  DELETE FROM public.trip_conditions_reviews WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('trip_conditions_reviews', v_rows);

  -- Their Save to trip receipts, which outlive the trip (019).
  DELETE FROM public.trip_kit_saves WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('trip_kit_saves', v_rows);

  -- Who did what on trips that stay: shared gear they assigned, accepted or
  -- packed, and its history. The gear itself stays with the crew. Its revision
  -- stays too, so nobody's open edit turns into a conflict.
  UPDATE public.trip_group_gear SET
    assigned_by = CASE WHEN assigned_by = p_user_id THEN v_anonymous ELSE assigned_by END,
    accepted_by = CASE WHEN accepted_by = p_user_id THEN v_anonymous ELSE accepted_by END,
    packed_by = CASE WHEN packed_by = p_user_id THEN v_anonymous ELSE packed_by END,
    events = (
      SELECT coalesce(jsonb_agg(CASE WHEN event->>'actor' = p_user_id
        THEN jsonb_set(event, '{actor}', to_jsonb(v_anonymous)) ELSE event END ORDER BY position), '[]'::jsonb)
      FROM jsonb_array_elements(events) WITH ORDINALITY AS history(event, position)
    )
  WHERE p_user_id IN (assigned_by, accepted_by, packed_by)
    OR events @> jsonb_build_array(jsonb_build_object('actor', p_user_id));
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_anonymized := v_anonymized + v_rows;

  -- Day checks they recorded for someone else. Their own went with their
  -- membership.
  UPDATE public.trip_day_checks SET recorded_by = v_anonymous WHERE recorded_by = p_user_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_anonymized := v_anonymized + v_rows;

  -- Only a trip's organizer writes these, so they name the deleted account only
  -- on its own trips, which are gone. Kept for anything older or written by
  -- hand.
  UPDATE public.trip_day_tour_plans SET
    created_by = CASE WHEN created_by = p_user_id THEN v_anonymous ELSE created_by END,
    updated_by = CASE WHEN updated_by = p_user_id THEN v_anonymous ELSE updated_by END
  WHERE p_user_id IN (created_by, updated_by);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_anonymized := v_anonymized + v_rows;

  UPDATE public.trip_conditions_sources SET
    created_by = CASE WHEN created_by = p_user_id THEN v_anonymous ELSE created_by END,
    updated_by = CASE WHEN updated_by = p_user_id THEN v_anonymous ELSE updated_by END
  WHERE p_user_id IN (created_by, updated_by);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_anonymized := v_anonymized + v_rows;

  UPDATE public.trip_day_conditions_sources SET added_by = v_anonymous WHERE added_by = p_user_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_anonymized := v_anonymized + v_rows;

  UPDATE public.trip_drive_manual_estimates SET entered_by = v_anonymous WHERE entered_by = p_user_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_anonymized := v_anonymized + v_rows;

  IF to_regclass('public.trip_member_day_origins') IS NOT NULL THEN
    EXECUTE 'UPDATE public.trip_member_day_origins SET updated_by = $1 WHERE updated_by = $2'
      USING v_anonymous, p_user_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_anonymized := v_anonymized + v_rows;
  END IF;
  v_counts := v_counts || jsonb_build_object('trip_rows_anonymized', v_anonymized);

  -- Their own account data.
  DELETE FROM public.user_preferences WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('user_preferences', v_rows);

  DELETE FROM public.user_wardrobe WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('user_wardrobe', v_rows);

  DELETE FROM public.user_item_mappings WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('user_item_mappings', v_rows);

  DELETE FROM public.user_custom_items WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('user_custom_items', v_rows);

  RETURN v_counts;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_user_data(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_data(text) TO service_role;
