-- Personal physical packing checks (#171). Exact saved-item keys, not labels,
-- positions, or aliases. Unchecked entries retain a version to detect conflicts.
-- The existing RLS/service-only grants and member/trip deletion cascades apply.
ALTER TABLE public.trip_member_packing ADD COLUMN checks jsonb NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(checks) = 'object');

-- set_packed: {key, packed, quantity, expected, mutation, kits, aliases}.
-- expected is the previous check version (null for none); mutation is a client
-- UUID retained for retries. P0409 means the check or quantity changed elsewhere.
-- The server validates the key against the current user's saved outfits and
-- supplies aliases for quantity lookup. Checks themselves never use aliases.
CREATE OR REPLACE FUNCTION public.update_trip_packing(
  p_trip_id uuid,
  p_user_id text,
  p_op jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  me public.trip_members;
  v_row public.trip_member_packing;
  v_op text := p_op->>'op';
  v_name text;
  v_quantity int;
  v_key text;
  v_count int;
  v_matched int;
  v_actual_quantity int;
BEGIN
  -- Serialize against kit/itinerary writers and membership removal.
  PERFORM 1 FROM public.trips WHERE id = p_trip_id FOR SHARE;
  SELECT * INTO me FROM public.trip_members
    WHERE trip_id = p_trip_id AND user_id = p_user_id AND status <> 'left' FOR SHARE;
  IF NOT FOUND OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Not found' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(p_op) IS DISTINCT FROM 'object' OR v_op IS NULL
    OR v_op NOT IN ('add_item', 'item_quantity', 'remove_item', 'quantity', 'acknowledge', 'set_packed') THEN
    RAISE EXCEPTION 'Invalid change' USING ERRCODE = '22023';
  END IF;
  IF v_op IN ('add_item', 'item_quantity', 'quantity', 'set_packed') THEN
    IF jsonb_typeof(p_op->'quantity') IS DISTINCT FROM 'number' OR (p_op->>'quantity') !~ '^[0-9]{1,2}$' THEN
      RAISE EXCEPTION 'Invalid quantity' USING ERRCODE = '22023';
    END IF;
    v_quantity := (p_op->>'quantity')::int;
    IF v_quantity < 1 OR v_quantity > 20 THEN RAISE EXCEPTION 'Invalid quantity' USING ERRCODE = '22023'; END IF;
  END IF;
  IF v_op IN ('add_item', 'item_quantity', 'remove_item')
    AND coalesce(p_op->>'id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Invalid item' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.trip_member_packing (trip_member_id, trip_id) VALUES (me.id, p_trip_id)
    ON CONFLICT (trip_member_id) DO NOTHING;
  SELECT * INTO v_row FROM public.trip_member_packing WHERE trip_member_id = me.id FOR UPDATE;

  IF v_op = 'set_packed' THEN
    v_key := p_op->>'key';
    IF coalesce(v_key, '') = '' OR char_length(v_key) > 300
      OR jsonb_typeof(p_op->'packed') IS DISTINCT FROM 'boolean'
      OR coalesce(p_op->>'mutation', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR NOT p_op ? 'expected'
      OR (p_op->'expected' <> 'null'::jsonb AND coalesce(p_op->>'expected', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
      OR jsonb_typeof(p_op->'kits') IS DISTINCT FROM 'object'
      OR jsonb_typeof(p_op->'aliases') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Invalid check' USING ERRCODE = '22023';
    END IF;
    -- A response lost after commit can be retried without applying the edit twice.
    IF v_row.checks->v_key->>'version' = p_op->>'mutation' THEN
      IF v_row.checks->v_key->'packed' IS DISTINCT FROM p_op->'packed'
        OR v_row.checks->v_key->'quantity' IS DISTINCT FROM p_op->'quantity' THEN
        RAISE EXCEPTION 'Mutation reused' USING ERRCODE = '22023';
      END IF;
      RETURN to_jsonb(v_row);
    END IF;
    IF (v_row.checks->v_key->>'version') IS DISTINCT FROM (p_op->>'expected') THEN
      RAISE EXCEPTION 'Packing check changed' USING ERRCODE = 'P0409';
    END IF;
    IF left(v_key, 7) = 'manual:' THEN
      SELECT (e->>'quantity')::int INTO v_actual_quantity FROM jsonb_array_elements(v_row.items) e
        WHERE e->>'id' = substring(v_key FROM 8);
      IF NOT FOUND THEN RAISE EXCEPTION 'Item not found' USING ERRCODE = 'P0002'; END IF;
    ELSE
      -- Aliases come only from the API's derivation, never from the client.
      SELECT (v_row.quantities->>k)::int INTO v_actual_quantity
        FROM jsonb_array_elements_text(jsonb_build_array(v_key) || (p_op->'aliases')) WITH ORDINALITY AS a(k, n)
        WHERE v_row.quantities ? k ORDER BY n LIMIT 1;
      v_actual_quantity := coalesce(v_actual_quantity, 1);
    END IF;
    IF v_actual_quantity <> v_quantity THEN
      RAISE EXCEPTION 'Packing quantity changed' USING ERRCODE = 'P0409';
    END IF;
    SELECT count(*), count(*) FILTER (WHERE k.updated_at = ((p_op->'kits')->>(k.id::text))::timestamptz)
      INTO v_count, v_matched
      FROM (SELECT k.id, k.updated_at FROM public.trip_member_day_kits k
              JOIN public.trip_days d ON d.id = k.trip_day_id
              JOIN public.trips t ON t.id = d.trip_id
              WHERE d.trip_id = p_trip_id AND k.trip_member_id = me.id
                AND d.date BETWEEN t.start_date AND t.end_date
                AND (k.outfit IS NOT NULL OR jsonb_array_length(k.items) > 0)
              FOR SHARE OF k) AS k;
    IF v_count <> v_matched OR v_count <> (SELECT count(*) FROM jsonb_object_keys(p_op->'kits')) THEN
      RAISE EXCEPTION 'Kits changed' USING ERRCODE = '40001';
    END IF;
    IF NOT v_row.checks ? v_key AND (SELECT count(*) FROM jsonb_object_keys(v_row.checks)) >= 1000 THEN
      RAISE EXCEPTION 'Too many checks' USING ERRCODE = '22023';
    END IF;
    v_row.checks := v_row.checks || jsonb_build_object(v_key,
      jsonb_build_object('packed', p_op->'packed', 'quantity', v_quantity, 'version', p_op->>'mutation'));
  ELSIF v_op = 'add_item' THEN
    v_name := btrim(coalesce(p_op->>'name', ''));
    IF v_name = '' OR char_length(v_name) > 80 THEN RAISE EXCEPTION 'Invalid name' USING ERRCODE = '22023'; END IF;
    IF NOT v_row.items @> jsonb_build_array(jsonb_build_object('id', p_op->>'id')) THEN
      IF jsonb_array_length(v_row.items) >= 50 THEN RAISE EXCEPTION 'Too many items' USING ERRCODE = '22023'; END IF;
      v_row.items := v_row.items || jsonb_build_array(jsonb_build_object('id', p_op->>'id', 'name', v_name, 'quantity', v_quantity));
    END IF;
  ELSIF v_op = 'item_quantity' THEN
    IF NOT v_row.items @> jsonb_build_array(jsonb_build_object('id', p_op->>'id')) THEN
      RAISE EXCEPTION 'Item not found' USING ERRCODE = 'P0002';
    END IF;
    -- A quantity change needs a fresh physical packing confirmation.
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_row.items) e WHERE e->>'id' = p_op->>'id' AND (e->>'quantity')::int <> v_quantity) THEN
      v_row.checks := jsonb_set(v_row.checks, ARRAY['manual:' || (p_op->>'id')],
        jsonb_build_object('packed', false, 'quantity', v_quantity, 'version', gen_random_uuid()::text));
    END IF;
    v_row.items := (SELECT jsonb_agg(CASE WHEN e->>'id' = p_op->>'id' THEN e || jsonb_build_object('quantity', v_quantity) ELSE e END ORDER BY n)
      FROM jsonb_array_elements(v_row.items) WITH ORDINALITY AS t(e, n));
  ELSIF v_op = 'remove_item' THEN
    v_row.checks := v_row.checks - ('manual:' || (p_op->>'id'));
    v_row.items := coalesce((SELECT jsonb_agg(e ORDER BY n)
      FROM jsonb_array_elements(v_row.items) WITH ORDINALITY AS t(e, n) WHERE e->>'id' <> p_op->>'id'), '[]'::jsonb);
  ELSIF v_op = 'quantity' THEN
    v_key := p_op->>'key';
    IF v_key IS NULL OR v_key = '' OR char_length(v_key) > 300 THEN RAISE EXCEPTION 'Invalid item' USING ERRCODE = '22023'; END IF;
    IF NOT v_row.quantities ? v_key AND (SELECT count(*) FROM jsonb_object_keys(v_row.quantities)) >= 300 THEN
      RAISE EXCEPTION 'Too many quantities' USING ERRCODE = '22023';
    END IF;
    -- Record quantity history even before the first physical check, so an
    -- old expected:null cannot survive a quantity change and restoration.
    IF coalesce((v_row.checks->v_key->>'quantity')::int, (v_row.quantities->>v_key)::int, 1) <> v_quantity THEN
      v_row.checks := jsonb_set(v_row.checks, ARRAY[v_key],
        jsonb_build_object('packed', false, 'quantity', v_quantity, 'version', gen_random_uuid()::text));
    END IF;
    v_row.quantities := v_row.quantities || jsonb_build_object(v_key, v_quantity);
  ELSE
    IF jsonb_typeof(p_op->'seen') IS DISTINCT FROM 'object' OR jsonb_typeof(p_op->'kits') IS DISTINCT FROM 'object'
      OR octet_length((p_op->'seen')::text) > 200000 THEN
      RAISE EXCEPTION 'Invalid acknowledgement' USING ERRCODE = '22023';
    END IF;
    -- The member's kits now, locked against changes until this commits.
    SELECT count(*), count(*) FILTER (WHERE k.updated_at = ((p_op->'kits')->>(k.id::text))::timestamptz)
      INTO v_count, v_matched
      FROM (SELECT k.id, k.updated_at FROM public.trip_member_day_kits k
              JOIN public.trip_days d ON d.id = k.trip_day_id
              JOIN public.trips t ON t.id = d.trip_id
              WHERE d.trip_id = p_trip_id AND k.trip_member_id = me.id
                AND d.date BETWEEN t.start_date AND t.end_date
                AND (k.outfit IS NOT NULL OR jsonb_array_length(k.items) > 0)
              FOR SHARE OF k) AS k;
    IF v_count <> v_matched OR v_count <> (SELECT count(*) FROM jsonb_object_keys(p_op->'kits')) THEN
      RAISE EXCEPTION 'Kits changed' USING ERRCODE = '40001';
    END IF;
    v_row.seen := p_op->'seen';
  END IF;

  UPDATE public.trip_member_packing
    SET items = v_row.items, quantities = v_row.quantities, seen = v_row.seen, checks = v_row.checks, updated_at = now()
    WHERE trip_member_id = me.id
    RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END;
$$;

-- The API checks the Clerk identity and calls this with the service-role client.
REVOKE ALL ON FUNCTION public.update_trip_packing(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_trip_packing(uuid, text, jsonb) TO service_role;
