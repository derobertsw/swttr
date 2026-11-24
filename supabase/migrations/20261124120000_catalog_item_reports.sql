-- #277: signed-in people report a problem with a catalog item (wrong photo,
-- specs, warmth, category, a duplicate, discontinued, something else), and
-- the team triages the reports by hand. docs/catalog-reports.md has the triage
-- queries.
--
-- Apply this on its own in the SQL editor before deploying the API that calls
-- it. Nothing reads the table or calls the function until then; until it's
-- applied, POST /api/wardrobe/reports answers 503.
--
-- It needs 20261116150000_delete_user_data (in prod since 2026-11-16; prod's
-- function body matched that file byte for byte on 2026-11-23). It replaces
-- delete_user_data with the same body plus the new table, so a later
-- migration that replaces it again has to start from this one.

CREATE TABLE public.catalog_item_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  -- The catalog row, by table. Custom items are the user's own to edit, so
  -- they can't be reported.
  item_type text NOT NULL CHECK (item_type IN ('garment', 'handwear', 'headwear')),
  item_id uuid NOT NULL,
  -- Brand and model when the report was last sent, so triage still knows what
  -- it was about after the catalog row is renamed or removed.
  item_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(item_snapshot) = 'object'),
  reasons text[] NOT NULL CHECK (
    cardinality(reasons) BETWEEN 1 AND 7
    AND reasons <@ ARRAY['wrong_photo', 'wrong_specs', 'wrong_warmth', 'wrong_category', 'duplicate', 'discontinued', 'other']
  ),
  note varchar(1000) CHECK (note IS NULL OR length(btrim(note)) > 0),
  product_url varchar(500) CHECK (product_url IS NULL OR product_url ~* '^https?://'),
  -- Triage: open until someone looks, in_progress while a fix is underway,
  -- then resolved (fixed) or dismissed (not a problem, or nothing to act on).
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'dismissed')),
  triage_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CHECK ((status IN ('resolved', 'dismissed')) = (resolved_at IS NOT NULL))
);

-- One report per person and item while it's being looked at. Reporting the
-- item again adds to that report (submit_catalog_item_report).
CREATE UNIQUE INDEX catalog_item_reports_one_open
  ON public.catalog_item_reports (user_id, item_type, item_id)
  WHERE status IN ('open', 'in_progress');
CREATE INDEX catalog_item_reports_triage ON public.catalog_item_reports (status, created_at);
CREATE INDEX catalog_item_reports_item ON public.catalog_item_reports (item_type, item_id);
CREATE INDEX catalog_item_reports_user ON public.catalog_item_reports (user_id, created_at);

ALTER TABLE public.catalog_item_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.catalog_item_reports FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.catalog_item_reports TO service_role;

-- Records a report, or adds to the person's open report on the item. The API
-- has checked the input's shape; this checks it again, and checks what only
-- the database knows. Errors:
-- - 22023: the input isn't a valid report.
-- - P0002: no catalog item has that type and ID.
-- - 54000: the person started 20 reports in the last 24 hours. Adding to an
--   open report doesn't count.
-- Returns {id, outcome: 'created' | 'updated', reasons}.
CREATE FUNCTION public.submit_catalog_item_report(
  p_user_id text, p_item_type text, p_item_id uuid, p_reasons text[], p_note text, p_product_url text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  -- Reasons in the order the form lists them.
  v_order constant text[] := ARRAY['wrong_photo', 'wrong_specs', 'wrong_warmth', 'wrong_category', 'duplicate', 'discontinued', 'other'];
  v_daily_limit constant integer := 20;
  v_item jsonb;
  v_note text := nullif(btrim(p_note), '');
  v_url text := nullif(btrim(p_product_url), '');
  v_open public.catalog_item_reports;
  v_reasons text[];
  v_recent integer;
  v_id uuid;
BEGIN
  IF p_user_id IS NULL OR btrim(p_user_id) = '' OR p_item_id IS NULL
    OR p_reasons IS NULL OR cardinality(p_reasons) = 0 OR array_position(p_reasons, NULL) IS NOT NULL
    OR NOT (p_reasons <@ v_order) THEN
    RAISE EXCEPTION 'Invalid report' USING ERRCODE = '22023';
  END IF;

  IF p_item_type = 'garment' THEN
    SELECT jsonb_build_object('brand', brand, 'model_name', model_name) INTO v_item FROM public.garments WHERE id = p_item_id;
  ELSIF p_item_type = 'handwear' THEN
    SELECT jsonb_build_object('brand', brand, 'model_name', model_name) INTO v_item FROM public.handwear WHERE id = p_item_id;
  ELSIF p_item_type = 'headwear' THEN
    SELECT jsonb_build_object('brand', brand, 'model_name', model_name) INTO v_item FROM public.headwear WHERE id = p_item_id;
  ELSE
    RAISE EXCEPTION 'Invalid report' USING ERRCODE = '22023';
  END IF;
  IF v_item IS NULL THEN
    RAISE EXCEPTION 'No such catalog item' USING ERRCODE = 'P0002';
  END IF;

  -- One person's reports one at a time, so the limit and the open report
  -- can't race.
  PERFORM pg_advisory_xact_lock(hashtextextended('catalog_item_reports:' || p_user_id, 0));

  SELECT * INTO v_open FROM public.catalog_item_reports
    WHERE user_id = p_user_id AND item_type = p_item_type AND item_id = p_item_id
      AND status IN ('open', 'in_progress')
    FOR UPDATE;

  IF FOUND THEN
    -- Add the new reasons. A new note or link replaces the old one; leaving
    -- them out keeps what was there.
    SELECT array_agg(reason ORDER BY array_position(v_order, reason)) INTO v_reasons
      FROM (SELECT DISTINCT unnest(v_open.reasons || p_reasons) AS reason) AS merged;
    UPDATE public.catalog_item_reports SET
      reasons = v_reasons,
      note = coalesce(v_note, note),
      product_url = coalesce(v_url, product_url),
      item_snapshot = v_item,
      updated_at = now()
    WHERE id = v_open.id;
    RETURN jsonb_build_object('id', v_open.id, 'outcome', 'updated', 'reasons', to_jsonb(v_reasons));
  END IF;

  SELECT count(*) INTO v_recent FROM public.catalog_item_reports
    WHERE user_id = p_user_id AND created_at > now() - interval '24 hours';
  IF v_recent >= v_daily_limit THEN
    RAISE EXCEPTION 'Too many reports' USING ERRCODE = '54000';
  END IF;

  SELECT array_agg(reason ORDER BY array_position(v_order, reason)) INTO v_reasons
    FROM (SELECT DISTINCT unnest(p_reasons) AS reason) AS given;
  INSERT INTO public.catalog_item_reports (user_id, item_type, item_id, item_snapshot, reasons, note, product_url)
    VALUES (p_user_id, p_item_type, p_item_id, v_item, v_reasons, v_note, v_url)
    RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'outcome', 'created', 'reasons', to_jsonb(v_reasons));
END;
$$;
REVOKE ALL ON FUNCTION public.submit_catalog_item_report(text, text, uuid, text[], text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_catalog_item_report(text, text, uuid, text[], text, text) TO service_role;

-- Account deletion (#139) deletes the account's reports too. The body is
-- 20261116150000's, with the catalog_item_reports block after user_custom_items.
CREATE OR REPLACE FUNCTION public.delete_user_data(p_user_id text)
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

  -- Their reports of catalog problems (20261124120000). The note and link are
  -- their own words, so the reports go too. Fixes they led to stay in the
  -- catalog.
  DELETE FROM public.catalog_item_reports WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('catalog_item_reports', v_rows);

  RETURN v_counts;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_user_data(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_data(text) TO service_role;
