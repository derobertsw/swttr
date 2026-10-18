-- #179. Existing assignments deliberately start awaiting acceptance.
ALTER TABLE public.trip_group_gear
  ADD COLUMN revision uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN assigned_at timestamptz,
  ADD COLUMN assigned_by text,
  ADD COLUMN accepted_at timestamptz,
  ADD COLUMN accepted_by text,
  ADD COLUMN packed_at timestamptz,
  ADD COLUMN packed_by text,
  ADD COLUMN events jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD CONSTRAINT shared_acceptance_pair CHECK ((accepted_at IS NULL) = (accepted_by IS NULL)),
  ADD CONSTRAINT shared_packing_pair CHECK ((packed_at IS NULL) = (packed_by IS NULL)),
  ADD CONSTRAINT shared_acceptance_assignee CHECK (accepted_at IS NULL OR assignee_member_id IS NOT NULL),
  ADD CONSTRAINT shared_packing_acceptance CHECK (packed_at IS NULL OR accepted_at IS NOT NULL);

-- Match 014: Clerk authentication is checked by the API, and again by the
-- service-only RPC below. Public database roles cannot read or mutate this table.
DROP POLICY IF EXISTS "Trip group gear access" ON public.trip_group_gear;
REVOKE ALL ON public.trip_group_gear FROM anon, authenticated;
GRANT ALL ON public.trip_group_gear TO service_role;

-- Old API instances can still assign while the deployment rolls over. A
-- direct assignment/name edit must never carry forward someone else's check.
CREATE FUNCTION public.invalidate_legacy_shared_gear() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.revision = OLD.revision AND (NEW.assignee_member_id IS DISTINCT FROM OLD.assignee_member_id
      OR NEW.description IS DISTINCT FROM OLD.description) THEN
    NEW.accepted_at := NULL; NEW.accepted_by := NULL;
    NEW.packed_at := NULL; NEW.packed_by := NULL;
    NEW.revision := gen_random_uuid();
    NEW.assigned_at := clock_timestamp(); NEW.assigned_by := NULL;
    NEW.events := OLD.events || jsonb_build_array(jsonb_build_object('action', 'legacy_assignment_changed',
      'actor', NULL, 'at', clock_timestamp(), 'assignee', NEW.assignee_member_id));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER invalidate_legacy_shared_gear BEFORE UPDATE ON public.trip_group_gear
FOR EACH ROW EXECUTE FUNCTION public.invalidate_legacy_shared_gear();
REVOKE ALL ON FUNCTION public.invalidate_legacy_shared_gear() FROM PUBLIC, anon, authenticated;

-- A deleted/departed member returns their items to the organizer, atomically.
-- Runs BEFORE the FK's ON DELETE SET NULL, while the old identity is available.
CREATE FUNCTION public.release_member_shared_gear() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE actor text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status <> 'left' OR OLD.status = 'left' THEN RETURN NEW; END IF;
  END IF;
  SELECT owner_user_id INTO actor FROM public.trips WHERE id = OLD.trip_id FOR UPDATE;
  UPDATE public.trip_group_gear SET
    assignee_member_id = NULL, accepted_at = NULL, accepted_by = NULL,
    packed_at = NULL, packed_by = NULL, revision = gen_random_uuid(),
    assigned_at = clock_timestamp(), assigned_by = actor,
    events = events || jsonb_build_array(jsonb_build_object('action', 'member_removed',
      'actor', actor, 'at', clock_timestamp(), 'assignee', OLD.id))
  WHERE trip_id = OLD.trip_id AND assignee_member_id = OLD.id;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER release_member_shared_gear BEFORE DELETE OR UPDATE OF status ON public.trip_members
FOR EACH ROW EXECUTE FUNCTION public.release_member_shared_gear();
REVOKE ALL ON FUNCTION public.release_member_shared_gear() FROM PUBLIC, anon, authenticated;

-- Every mutation holds the trip and row locks; actor checks and revision checks
-- are in the same transaction as the write. No client-supplied audit fields.
CREATE FUNCTION public.update_trip_shared_gear(p_trip uuid, p_user text, p_id uuid, p_change jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  owner_id text;
  g public.trip_group_gear%ROWTYPE;
  recipient public.trip_members%ROWTYPE;
  action text := p_change->>'action';
  target uuid;
  at_time timestamptz := clock_timestamp();
  self_assignment boolean := false;
  can_confirm boolean := false;
BEGIN
  SELECT owner_user_id INTO owner_id FROM public.trips WHERE id = p_trip FOR UPDATE;
  IF owner_id IS NULL OR p_user IS NULL OR (owner_id <> p_user AND NOT EXISTS (
    SELECT 1 FROM public.trip_members WHERE trip_id = p_trip AND user_id = p_user AND status = 'joined'
  )) THEN RAISE EXCEPTION 'Not found' USING ERRCODE = 'P0002'; END IF;
  IF action IS NULL OR action NOT IN ('create', 'assign', 'accept', 'decline', 'pack', 'unpack', 'delete') THEN
    RAISE EXCEPTION 'Choose a shared gear action' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO g FROM public.trip_group_gear WHERE id = p_id AND trip_id = p_trip FOR UPDATE;
  IF action = 'create' THEN
    IF g.id IS NOT NULL THEN
      -- Safe retry of the same creation; never duplicate a lost response.
      IF g.description = btrim(p_change->>'description') AND g.assigned_by = p_user THEN RETURN to_jsonb(g); END IF;
      RAISE EXCEPTION 'This item changed. Reload shared gear.' USING ERRCODE = 'P0409';
    END IF;
    IF p_change->>'description' IS NULL OR length(btrim(p_change->>'description')) NOT BETWEEN 1 AND 200 THEN
      RAISE EXCEPTION 'Name the item in 1 to 200 characters' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF g.id IS NULL THEN RAISE EXCEPTION 'Item not found. Reload shared gear.' USING ERRCODE = 'P0002'; END IF;
    IF p_change->>'expected_revision' IS DISTINCT FROM g.revision::text THEN
      RAISE EXCEPTION 'This item changed. Reload shared gear and review it before trying again.' USING ERRCODE = 'P0409';
    END IF;
  END IF;

  IF action IN ('create', 'assign') THEN
    target := NULLIF(p_change->>'assignee_member_id', '')::uuid;
    IF target IS NOT NULL THEN
      SELECT * INTO recipient FROM public.trip_members WHERE id = target AND trip_id = p_trip AND status <> 'left' FOR KEY SHARE;
      IF recipient.id IS NULL THEN RAISE EXCEPTION 'Choose a current trip member' USING ERRCODE = '22023'; END IF;
      self_assignment := recipient.user_id = p_user AND recipient.status = 'joined';
    END IF;
    -- Crew may volunteer for themselves; only the organizer requests others.
    IF owner_id <> p_user AND (NOT coalesce(self_assignment, false)
      OR (action = 'assign' AND g.assignee_member_id IS NOT NULL AND g.assignee_member_id <> target)) THEN
      RAISE EXCEPTION 'Only the organizer can assign another person' USING ERRCODE = '42501';
    END IF;
    IF action = 'assign' AND g.assignee_member_id IS NOT DISTINCT FROM target THEN RETURN to_jsonb(g); END IF;
    IF action = 'create' THEN
      INSERT INTO public.trip_group_gear (id, trip_id, description, sort_order, assigned_by)
      VALUES (p_id, p_trip, btrim(p_change->>'description'),
        (SELECT coalesce(max(sort_order), -1) + 1 FROM public.trip_group_gear WHERE trip_id = p_trip), p_user)
      RETURNING * INTO g;
    END IF;
    UPDATE public.trip_group_gear SET assignee_member_id = target,
      assigned_by = p_user, assigned_at = at_time,
      accepted_by = CASE WHEN self_assignment THEN p_user END,
      accepted_at = CASE WHEN self_assignment THEN at_time END,
      packed_by = NULL, packed_at = NULL, revision = gen_random_uuid(),
      events = events || jsonb_build_array(jsonb_build_object('action', action, 'actor', p_user, 'at', at_time, 'assignee', target))
    WHERE id = p_id RETURNING * INTO g;
  ELSIF action = 'delete' THEN
    IF owner_id <> p_user THEN RAISE EXCEPTION 'Organizer only' USING ERRCODE = '42501'; END IF;
    DELETE FROM public.trip_group_gear WHERE id = p_id;
    RETURN jsonb_build_object('deleted', true);
  ELSE
    SELECT * INTO recipient FROM public.trip_members WHERE id = g.assignee_member_id AND trip_id = p_trip AND status <> 'left' FOR KEY SHARE;
    can_confirm := recipient.id IS NOT NULL AND (
      (recipient.user_id = p_user AND recipient.status = 'joined') OR
      (owner_id = p_user AND recipient.user_id IS NULL AND recipient.role = 'guest' AND recipient.status = 'guest'));
    IF NOT coalesce(can_confirm, false) THEN
      RAISE EXCEPTION 'Only the recipient, or the organizer for a managed guest, can confirm' USING ERRCODE = '42501';
    END IF;
    IF action = 'accept' AND g.accepted_at IS NOT NULL THEN RETURN to_jsonb(g); END IF;
    IF action IN ('pack', 'unpack') AND g.accepted_at IS NULL THEN
      RAISE EXCEPTION 'Accept responsibility before marking packed' USING ERRCODE = '22023';
    END IF;
    UPDATE public.trip_group_gear SET
      assignee_member_id = CASE WHEN action = 'decline' THEN NULL ELSE assignee_member_id END,
      accepted_at = CASE WHEN action = 'decline' THEN NULL WHEN action = 'accept' THEN at_time ELSE accepted_at END,
      accepted_by = CASE WHEN action = 'decline' THEN NULL WHEN action = 'accept' THEN p_user ELSE accepted_by END,
      packed_at = CASE WHEN action = 'pack' THEN at_time ELSE NULL END,
      packed_by = CASE WHEN action = 'pack' THEN p_user ELSE NULL END,
      revision = gen_random_uuid(),
      events = events || jsonb_build_array(jsonb_build_object('action', action, 'actor', p_user, 'at', at_time, 'assignee', g.assignee_member_id))
    WHERE id = p_id RETURNING * INTO g;
  END IF;
  RETURN to_jsonb(g);
END $$;
REVOKE ALL ON FUNCTION public.update_trip_shared_gear(uuid, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_trip_shared_gear(uuid, text, uuid, jsonb) TO service_role;
