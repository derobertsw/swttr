-- Application revision/preview conflicts are permanent for that request.
-- PostgREST 14 retries SQLSTATE 40001 indefinitely, even after disconnect.
-- PT409 returns a non-retryable HTTP 409 instead. Deploy the API's dual-code
-- handling first; see docs/qa/210-tour-plans/README.md for rollout/recovery.
-- Keep function identities, bodies, ownership, security mode and ACLs intact;
-- change only the deliberately raised conflict code in these trip functions.
DO $migration$
DECLARE
  target oid;
BEGIN
  FOR target IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND p.proname = ANY (ARRAY[
        'mutate_trip_tour_plan', 'change_trip_dates', 'copy_trip_day',
        'edit_trip_itinerary', 'edit_trip_itinerary_reviewed',
        'set_trip_access_point', 'set_trip_day_origin', 'set_trip_drive_estimate',
        'mutate_trip_lodging', 'mutate_trip_conditions_source',
        'record_trip_conditions_review', 'update_trip_packing'
      ])
      AND p.prosrc LIKE '%' || quote_literal('40001') || '%'
  LOOP
    EXECUTE replace(pg_get_functiondef(target), quote_literal('40001'), quote_literal('PT409'));
  END LOOP;
END;
$migration$;

NOTIFY pgrst, 'reload schema';
