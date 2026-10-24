-- Departures by origin (#333): people who slept in different places drive to
-- the same access point from different starting points, so a day can have
-- more than one drive estimate. See docs/trip-locations.md.
--
-- trip_drive_estimates (028) kept one row per trip day. It now keeps one per
-- day and pair: route_key already names the starting point, the access point
-- and the routing options. Existing rows stay as they are. The server reuses
-- a stored estimate for the same pair from any day, so changing one person's
-- stay calculates only the drive that's new.
--
-- Apply after 028, on its own. The API writes with the new key and falls back
-- to one row per day until this is applied, so deploy the API first. An API
-- from before this change writes with the old key, which this removes: its
-- writes fail and it calculates on every visit until it's replaced.
ALTER TABLE public.trip_drive_estimates DROP CONSTRAINT trip_drive_estimates_pkey;
ALTER TABLE public.trip_drive_estimates ADD PRIMARY KEY (trip_id, date, route_key);
