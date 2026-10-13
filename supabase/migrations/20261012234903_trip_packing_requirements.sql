-- Personal packing requirements from accepted kit snapshots (#177).
-- Clerk authorization is checked in the server and again in this service-only RPC.
CREATE TABLE public.trip_member_packing (
  trip_member_id uuid PRIMARY KEY REFERENCES public.trip_members(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  requirements jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(requirements) = 'array'),
  manual_items jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(manual_items) = 'array'),
  quantities jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(quantities) = 'object')
);
ALTER TABLE public.trip_member_packing ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trip_member_packing FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.trip_member_packing TO service_role;

CREATE FUNCTION public.apply_trip_packing(
  p_trip_id uuid, p_user_id text, p_revision integer, p_sources jsonb,
  p_requirements jsonb, p_manual_items jsonb, p_quantities jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_trip public.trips;
  v_member public.trip_members;
  v_current public.trip_member_packing;
  v_sources jsonb;
BEGIN
  SELECT * INTO v_trip FROM public.trips WHERE id = p_trip_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_member FROM public.trip_members
    WHERE trip_id = p_trip_id AND user_id = p_user_id AND status <> 'left' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;
  -- Existing checklist writes do not take the trip lock. Lock their rows too.
  PERFORM d.id FROM public.trip_days d WHERE d.trip_id = p_trip_id ORDER BY d.date FOR UPDATE;
  PERFORM k.id FROM public.trip_member_day_kits k JOIN public.trip_days d ON d.id = k.trip_day_id
    WHERE d.trip_id = p_trip_id AND k.trip_member_id = v_member.id ORDER BY d.date FOR UPDATE OF k;
  SELECT jsonb_build_object('start_date', v_trip.start_date::text, 'end_date', v_trip.end_date::text,
    'days', coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'date', d.date::text,
      'kit_id', k.id, 'outfit', k.outfit) ORDER BY d.date), '[]')) INTO v_sources
    FROM public.trip_days d LEFT JOIN public.trip_member_day_kits k
      ON k.trip_day_id = d.id AND k.trip_member_id = v_member.id
    WHERE d.trip_id = p_trip_id AND d.date BETWEEN v_trip.start_date AND v_trip.end_date;
  IF v_sources IS DISTINCT FROM p_sources THEN
    RAISE EXCEPTION 'Your saved kits changed. Review packing again.' USING ERRCODE = '40001';
  END IF;
  INSERT INTO public.trip_member_packing(trip_member_id) VALUES(v_member.id) ON CONFLICT DO NOTHING;
  SELECT * INTO v_current FROM public.trip_member_packing WHERE trip_member_id = v_member.id FOR UPDATE;
  -- A lost response can be retried, without overwriting a later revision.
  IF v_current.revision = p_revision + 1 AND v_current.requirements = p_requirements
      AND v_current.manual_items = p_manual_items AND v_current.quantities = p_quantities THEN
    RETURN to_jsonb(v_current);
  END IF;
  IF v_current.revision IS DISTINCT FROM p_revision THEN
    RAISE EXCEPTION 'Packing changed in another session. Review it again.' USING ERRCODE = '40001';
  END IF;
  UPDATE public.trip_member_packing SET revision = revision + 1, requirements = p_requirements,
    manual_items = p_manual_items, quantities = p_quantities WHERE trip_member_id = v_member.id RETURNING * INTO v_current;
  RETURN to_jsonb(v_current);
END $$;
REVOKE ALL ON FUNCTION public.apply_trip_packing(uuid,text,integer,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_trip_packing(uuid,text,integer,jsonb,jsonb,jsonb,jsonb) TO service_role;
