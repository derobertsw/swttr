-- Packing from saved kits (#177). A member's packing list is worked out on the
-- server from the outfits saved to their trip days; this table keeps only what
-- the member decided about it. See docs/trip-packing.md.
--
-- - items: what they added by hand, [{id, name, quantity}].
-- - quantities: how many of an item from their kits to pack, by its key, when
--   it isn't one. A quantity stays when the item leaves the kits, so it's
--   there again if the item comes back.
-- - seen: their kit items as they last acknowledged them, by key, each
--   {name, slots}. Items since then show as new or replaced, and items gone
--   since then as no longer in their kits. Null until the first.
CREATE TABLE public.trip_member_packing (
  trip_member_id uuid PRIMARY KEY REFERENCES public.trip_members(id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  items jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(items) = 'array'),
  quantities jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(quantities) = 'object'),
  seen jsonb CHECK (seen IS NULL OR jsonb_typeof(seen) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trip_member_packing_trip ON public.trip_member_packing(trip_id);
ALTER TABLE public.trip_member_packing ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trip_member_packing FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.trip_member_packing TO service_role;

-- Applies one change to the signed-in member's own packing list and returns
-- the row. Each change merges into the row under its lock, so two sessions
-- never overwrite each other's changes.
--
-- p_op is one of:
-- - {op: 'add_item', id, name, quantity}: adds an item by hand. A repeat with
--   the same id changes nothing, so a retried request adds it once.
-- - {op: 'item_quantity', id, quantity}: P0002 when the item was removed.
-- - {op: 'remove_item', id}: removing an item that's gone changes nothing.
-- - {op: 'quantity', key, quantity}: for an item from the kits; 1 clears it.
-- - {op: 'acknowledge', seen, kits}: records `seen`. `kits` is each of the
--   member's kits on the trip's dates (an outfit or checklist items) by id, with the
--   updated_at it had when `seen` was worked out. When the kits no longer
--   match, nothing changes and the error is 40001. The kits are locked until
--   this commits, so a kit saved meanwhile is flagged afterwards, not hidden.
--
-- A user who isn't on the trip gets 42501; an invalid change 22023.
CREATE FUNCTION public.update_trip_packing(
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
BEGIN
  SELECT * INTO me FROM public.trip_members
    WHERE trip_id = p_trip_id AND user_id = p_user_id AND status <> 'left';
  IF NOT FOUND OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Not found' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(p_op) IS DISTINCT FROM 'object' OR v_op IS NULL
    OR v_op NOT IN ('add_item', 'item_quantity', 'remove_item', 'quantity', 'acknowledge') THEN
    RAISE EXCEPTION 'Invalid change' USING ERRCODE = '22023';
  END IF;
  IF v_op IN ('add_item', 'item_quantity', 'quantity') THEN
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

  IF v_op = 'add_item' THEN
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
    v_row.items := (SELECT jsonb_agg(CASE WHEN e->>'id' = p_op->>'id' THEN e || jsonb_build_object('quantity', v_quantity) ELSE e END ORDER BY n)
      FROM jsonb_array_elements(v_row.items) WITH ORDINALITY AS t(e, n));
  ELSIF v_op = 'remove_item' THEN
    v_row.items := coalesce((SELECT jsonb_agg(e ORDER BY n)
      FROM jsonb_array_elements(v_row.items) WITH ORDINALITY AS t(e, n) WHERE e->>'id' <> p_op->>'id'), '[]'::jsonb);
  ELSIF v_op = 'quantity' THEN
    v_key := p_op->>'key';
    IF v_key IS NULL OR v_key = '' OR char_length(v_key) > 300 THEN RAISE EXCEPTION 'Invalid item' USING ERRCODE = '22023'; END IF;
    IF v_quantity = 1 THEN
      v_row.quantities := v_row.quantities - v_key;
    ELSE
      IF NOT v_row.quantities ? v_key AND (SELECT count(*) FROM jsonb_object_keys(v_row.quantities)) >= 300 THEN
        RAISE EXCEPTION 'Too many quantities' USING ERRCODE = '22023';
      END IF;
      v_row.quantities := v_row.quantities || jsonb_build_object(v_key, v_quantity);
    END IF;
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
    SET items = v_row.items, quantities = v_row.quantities, seen = v_row.seen, updated_at = now()
    WHERE trip_member_id = me.id
    RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END;
$$;

-- The API checks the Clerk identity and calls this with the service-role client.
REVOKE ALL ON FUNCTION public.update_trip_packing(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_trip_packing(uuid, text, jsonb) TO service_role;
