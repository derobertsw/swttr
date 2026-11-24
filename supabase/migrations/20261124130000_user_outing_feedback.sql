-- How an outing's layers felt (#8): a signed-in person's answer after a Gear
-- up outing for now, or after a trip day with their saved outfit. See
-- docs/outing-feedback.md.
--
-- Apply this on its own, after 20261116150000 (delete_user_data), before or
-- after deploying the API that writes it. Until it's applied the feedback
-- routes answer 503 and the prompt says feedback can't be saved yet; nothing
-- else reads the table.
--
-- It adds the feedback to delete_user_data by patching the function in place,
-- so it keeps whatever another migration added to it. Apply any migration
-- that replaces delete_user_data whole (20261124120000_catalog_item_reports,
-- #426) before this one. If one is applied after it, run this file again:
-- it's safe to repeat, and only puts the feedback deletion back.
--
-- Each row keeps a snapshot of what the answer is about, so it stays readable
-- after the recommendation logic changes: the outfit as shown (`recommended`),
-- what was worn (`worn`, null when the person didn't say), the conditions,
-- the warm/cold preference and coarse body size, and when it was planned and
-- by which deployment. It keeps no place name or coordinates: only the region
-- and country.
CREATE TABLE IF NOT EXISTS public.user_outing_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  -- What the answer is about: a Gear up result ("gear_up:<key from the
  -- browser>"), or a saved trip kit ("trip_kit:<kit id>:<saved at>"). One row
  -- per person and source key, so answering again replaces the answer.
  source text NOT NULL CHECK (source IN ('gear_up', 'trip_kit')),
  source_key text NOT NULL CHECK (char_length(source_key) BETWEEN 1 AND 200),
  -- The trip day, for a trip kit. The feedback is the person's own, so it
  -- stays when the trip is deleted, without the trip.
  trip_id uuid REFERENCES public.trips(id) ON DELETE SET NULL,
  -- The day the outing was on, on the destination's calendar.
  trip_date date NOT NULL,
  activity text NOT NULL CHECK (char_length(activity) BETWEEN 1 AND 60),
  exertion text NOT NULL CHECK (exertion IN ('easy', 'moderate', 'hard')),
  advice_kind text NOT NULL CHECK (advice_kind IN ('personalized', 'general')),
  -- The reading the layers were for, or a plan day's coldest temperature and
  -- strongest wind, for grouping in reports. The full conditions are in `weather`.
  temperature_f numeric NOT NULL,
  wind_mph numeric NOT NULL,
  overall text NOT NULL CHECK (overall IN ('too_cold', 'just_right', 'too_warm')),
  -- When and where it felt that way; empty when not said, and for "just right".
  moments text[] NOT NULL DEFAULT '{}'
    CHECK (moments <@ ARRAY['sustained', 'start', 'stops', 'after']::text[]),
  body_areas text[] NOT NULL DEFAULT '{}'
    CHECK (body_areas <@ ARRAY['head_neck', 'torso', 'hands', 'legs', 'feet']::text[]),
  -- {as_suggested: true}, or {as_suggested: false, items, bare}. Null is
  -- unknown: not saying what was worn is never read as wearing the suggestion.
  worn jsonb CHECK (worn IS NULL OR jsonb_typeof(worn) = 'object'),
  recommended jsonb NOT NULL CHECK (jsonb_typeof(recommended) = 'object'),
  weather jsonb NOT NULL CHECK (jsonb_typeof(weather) = 'object'),
  -- The outing's time and XC details, region and country, warm/cold preference
  -- when planned (when known) and when answering, body size in bands, and
  -- minutes from the outing's start to the answer.
  context jsonb NOT NULL CHECK (jsonb_typeof(context) = 'object'),
  outing_started_at timestamptz,
  -- When the layers were worked out: the kit's save, or the reading for now.
  recommended_at timestamptz,
  -- The deployment's commit when the answer was saved.
  app_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_key),
  CHECK ((source = 'trip_kit') = (source_key LIKE 'trip_kit:%')),
  CHECK (source = 'trip_kit' OR trip_id IS NULL)
);
CREATE INDEX IF NOT EXISTS user_outing_feedback_activity ON public.user_outing_feedback(activity, created_at);
CREATE INDEX IF NOT EXISTS user_outing_feedback_trip ON public.user_outing_feedback(trip_id) WHERE trip_id IS NOT NULL;
DROP TRIGGER IF EXISTS update_user_outing_feedback_updated_at ON public.user_outing_feedback;
CREATE TRIGGER update_user_outing_feedback_updated_at BEFORE UPDATE ON public.user_outing_feedback
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- The API reads and writes it with the service role, for the signed-in user only.
ALTER TABLE public.user_outing_feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_outing_feedback FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.user_outing_feedback TO service_role;

-- Deleting an account deletes its feedback (docs/account-deletion.md). Only
-- delete_user_data's end changes: the feedback goes before its counts are
-- returned. It's patched in place rather than replaced, so a later migration
-- that patches it the same way keeps this.
DO $migration$
DECLARE
  target oid;
  anchor constant text := E'  RETURN v_counts;\nEND;';
  added constant text := E'  DELETE FROM public.user_outing_feedback WHERE user_id = p_user_id;\n'
    || E'  GET DIAGNOSTICS v_rows = ROW_COUNT;\n'
    || E'  v_counts := v_counts || jsonb_build_object(''user_outing_feedback'', v_rows);\n\n';
  definition text;
BEGIN
  SELECT p.oid INTO target FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'delete_user_data';
  IF target IS NULL THEN
    RAISE EXCEPTION 'delete_user_data not found; apply 20261116150000 first';
  END IF;
  definition := pg_get_functiondef(target);
  IF strpos(definition, 'public.user_outing_feedback') > 0 THEN
    RETURN;
  END IF;
  IF array_length(string_to_array(definition, anchor), 1) IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'delete_user_data''s end not found; it changed since 20261116150000';
  END IF;
  EXECUTE replace(definition, anchor, added || anchor);
END;
$migration$;

NOTIFY pgrst, 'reload schema';
