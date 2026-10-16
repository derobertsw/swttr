-- Drive estimates (#209): the road time and distance from a day's morning
-- origin (the stay of the night before) to its access point (027), as the
-- routing provider returned them. See docs/trip-locations.md.
--
-- One row per trip day. route_key names the pair and the routing options it
-- was calculated for (coordinates, mode, traffic, the winter closures it
-- avoided), so a changed stay, access point or closure season recalculates
-- instead of showing an estimate for another pair. The labels keep that
-- pair readable when it's shown as an earlier estimate. Rows go with the trip.
CREATE TABLE public.trip_drive_estimates (
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  date date NOT NULL,
  route_key varchar(1000) NOT NULL,
  origin_label varchar(300) NOT NULL,
  destination_label varchar(300) NOT NULL,
  status text NOT NULL CHECK (status IN ('ok', 'no_route')),
  duration_seconds integer CHECK (duration_seconds >= 0),
  distance_meters integer CHECK (distance_meters >= 0),
  provider text NOT NULL CHECK (provider IN ('geoapify')),
  calculated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, date),
  -- A road route has both numbers; "no road route" has neither, never zero.
  CHECK ((status = 'ok') = (duration_seconds IS NOT NULL AND distance_meters IS NOT NULL)),
  CHECK (status = 'ok' OR (duration_seconds IS NULL AND distance_meters IS NULL))
);

-- Read and written only by the server's service-role client, like 017's tables.
ALTER TABLE public.trip_drive_estimates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trip_drive_estimates FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.trip_drive_estimates TO service_role;
