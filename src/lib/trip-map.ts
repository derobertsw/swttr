import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { drivePlans } from "@/lib/trip-drive";
import { supabaseDriveStore, tripDriveEstimates } from "@/lib/trip-drive-estimates";
import { TOUR_ACTIVITY } from "@/lib/trip-activities";
import { buildLodging, dateLabel, loadLodging } from "@/lib/trip-lodging";
import { accessPointFor } from "@/lib/trip-location";
import { loadTourPlans, summarizeTourPlans } from "@/lib/trip-tour-plans";
import type { Trip, TripDay, TripDriveEstimates, TripFull, TripLocation, TripStop } from "@/types/trips";
import type { TripMap, TripMapDay, TripMapPlace, TripMapRole, TripMapSource } from "@/types/trip-map";

/** Ignore response-time age labels; revisions change with saved data/state, not each minute. */
const revision = (value: unknown) => createHash("sha256").update(JSON.stringify(value, (key, entry) => key === "age_label" ? undefined : entry)).digest("hex");
const placeId = (source: TripMapSource) => `${source.type}:${source.id}:${source.slot}`;

function mappedCoordinates(latitude: unknown, longitude: unknown): Pick<TripMapPlace, "coordinates" | "mapping"> {
  if (latitude == null && longitude == null) return { coordinates: null, mapping: "missing_coordinates" };
  if (typeof latitude !== "number" || typeof longitude !== "number" || !Number.isFinite(latitude) || !Number.isFinite(longitude)
    || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return { coordinates: null, mapping: "invalid_coordinates" };
  return { coordinates: { latitude, longitude }, mapping: "mapped" };
}

/** Reject unexpected foreign rows before any business helper can resolve them. No joins by untrusted IDs. */
function validateSources(full: TripFull): void {
  const tripId = full.trip.id;
  const stays = full.lodging?.stays ?? [];
  if ([...full.stops, ...full.days, ...stays, ...full.lodging?.assignments ?? [], ...full.tour_plans ?? []].some((row) => row.trip_id !== tripId)) {
    throw new Error("Invalid map source");
  }
  const stops = new Set(full.stops.map((stop) => stop.id));
  const days = new Set(full.days.map((day) => day.id));
  const stayIds = new Set(stays.map((stay) => stay.id));
  if (full.days.some((day) => day.stop_id !== null && !stops.has(day.stop_id))
    || full.lodging?.assignments.some((night) => night.stay_id !== null && !stayIds.has(night.stay_id))
    || full.tour_plans?.some((plan) => !days.has(plan.trip_day_id))) throw new Error("Invalid map reference");
  // A deleted stay's starting point deliberately remains a saved snapshot (#209).
  // access_point_stop_id may likewise name a removed stop: accessPointFor ignores it.
}

/** Server projection only: selection and panning never write itinerary data or call a provider. */
export function projectTripMap(full: TripFull, estimates: TripDriveEstimates, selectedDate: string | null = null): TripMap {
  validateSources(full);
  const lodging = full.lodging ?? buildLodging(full.trip, [], []);
  const plans = drivePlans({ ...full, lodging });
  const places = new Map<string, TripMapPlace>();
  const add = (source: TripMapSource, name: string, location: TripLocation | null | undefined, role: TripMapRole,
    visit?: { date: string; day_id: string }, legacy?: { latitude: number | null; longitude: number | null }) => {
    const id = placeId(source);
    let place = places.get(id);
    if (!place) {
      place = {
        id, source, name, address: location?.address ?? null,
        ...mappedCoordinates(location?.latitude ?? legacy?.latitude, location?.longitude ?? legacy?.longitude),
        precision: location?.precision ?? "unknown", time_zone: location?.time_zone ?? null,
        provenance: location ? { source: location.source, provider: location.provider, provider_id: location.provider_id, attribution: location.attribution } : null,
        roles: [], visits: [], nights: [], night_range: null,
      };
      places.set(id, place);
    }
    if (!place.roles.includes(role)) place.roles.push(role);
    if (visit && !place.visits.some((saved) => saved.date === visit.date && saved.role === role)) place.visits.push({ ...visit, role });
    return id;
  };
  // Only chosen stays (or one explicitly picked as a morning origin), never candidate stays.
  for (const stay of lodging.stays) {
    if (!stay.assigned_nights.length && !plans.some((plan) => plan.origin?.stay_id === stay.id)) continue;
    const id = add({ type: "stay", id: stay.id, slot: "location" }, stay.name, stay.location, "stay");
    const place = places.get(id)!;
    place.nights = [...stay.assigned_nights];
    place.night_range = { check_in: stay.check_in, check_out: stay.check_out };
    place.address ??= stay.address;
  }
  for (const stop of full.stops) add({ type: "stop", id: stop.id, slot: "destination" }, stop.name, null, "destination", undefined, stop);

  const days: TripMapDay[] = plans.map((plan) => {
    const day = full.days.find((entry) => entry.date === plan.date);
    // Itinerary dates with no saved day row are still selectable.
    const id = day?.id ?? `date:${plan.date}`;
    const visit = { date: plan.date, day_id: id };
    const stop = day ? full.stops.find((entry) => entry.id === day.stop_id) ?? full.stops[0] : undefined;
    const destinationId = stop ? add({ type: "stop", id: stop.id, slot: "destination" }, stop.name, null, "destination", visit, stop) : null;
    const point = day ? accessPointFor(full.stops, day) : null;
    const accessId = stop ? add(point?.scope === "day" ? { type: "day", id, slot: "access_point" } : { type: "stop", id: stop.id, slot: "access_point" },
      point?.location.label ?? `${stop.name} access point`, point?.location, "access", visit) : null;
    const originId = plan.origin ? add(plan.origin.stay_id ? { type: "stay", id: plan.origin.stay_id, slot: "location" } : { type: "day", id, slot: "origin" },
      plan.origin.label, plan.origin.location, "origin", visit) : null;
    const context = lodging.days.find((entry) => entry.date === plan.date)!;
    const crewStay = lodging.stays.find((stay) => stay.id === context.starting_stay_id);
    const crewStayId = crewStay ? add({ type: "stay", id: crewStay.id, slot: "location" }, crewStay.name, crewStay.location, "stay", visit) : null;
    const tonight = lodging.stays.find((stay) => stay.id === context.tonight_stay_id);
    const tonightId = tonight ? add({ type: "stay", id: tonight.id, slot: "location" }, tonight.name, tonight.location, "stay", visit) : null;
    // The Day page's activity: the day's own, or its stop's first. A saved tour
    // plan is in use only on a touring day; otherwise it's kept but not planned (#210).
    const activity = day?.activity ?? stop?.activities[0] ?? null;
    const tour = activity === TOUR_ACTIVITY ? full.tour_plans?.find((entry) => entry.trip_day_id === id) : undefined;
    const drive = estimates.days.find((entry) => entry.date === plan.date);
    if (!drive) throw new Error("Missing map drive state");
    // Reject invalid coordinates before offering external navigation, even for legacy/corrupt rows.
    const validEndpoints = originId && accessId && [originId, accessId].every((key) => places.get(key)?.mapping === "mapped");
    const safeDrive = validEndpoints ? drive : { ...drive, directions: null };
    const routeRevision = plan.route_key ? revision({ trip_id: full.trip.id, day_id: id, date: plan.date, origin_place_id: originId, access_place_id: accessId, route_key: plan.route_key }) : null;
    const geometryEligible = plan.state === "ready" && validEndpoints && safeDrive.state !== "no_route";
    const result = {
      id, date: plan.date, date_label: dateLabel(plan.date), activity,
      destination_place_id: destinationId, origin_place_id: originId, access_place_id: accessId, tonight_place_id: tonightId,
      crew_stay_place_id: crewStayId,
      meeting_place_id: tour ? accessId : null,
      starting_from: plan.origin?.label ?? "Not set", staying_tonight: context.staying_tonight,
      tonight_status: lodging.nights.find((night) => night.date === plan.date)?.status ?? "unplanned",
      pickup: { place_id: null, state: tour?.pickup_notes ? "notes_only" : "not_set", notes: tour?.pickup_notes ?? null },
      tour: tour ? { objective: tour.objective, route_url: tour.route_url, meet_label: tour.meet_label, time_zone_label: tour.time_zone_label,
        access_notes: tour.access_notes, approach_notes: tour.approach_notes } : null,
      drive: { ...safeDrive, source: safeDrive.state === "manual" ? "manual" : safeDrive.estimate || safeDrive.state === "no_route" ? "geoapify" : null },
      geometry: { state: geometryEligible ? "unavailable" : "not_applicable",
        reason: geometryEligible ? "not_requested" : "drive_not_ready",
        mode: "drive", revision: routeRevision, origin_place_id: originId, access_place_id: accessId },
    } satisfies Omit<TripMapDay, "revision">;
    const references = [destinationId, originId, accessId, tonightId, crewStayId].map((key) => key ? places.get(key) : null);
    return { ...result, revision: revision({ day: result, places: references }) };
  });
  const allPlaces = [...places.values()];
  const token = revision({ trip: full.trip, lodging_revision: lodging.revision, places: allPlaces, days });
  const scopedPlaces = selectedDate ? allPlaces.filter((place) => place.visits.some((visit) => visit.date === selectedDate)) : allPlaces;
  return {
    trip: { id: full.trip.id, name: full.trip.name }, revision: token, scope: { date: selectedDate },
    dates: days.map((day) => ({ date: day.date, label: day.date_label })), places: scopedPlaces,
    days: selectedDate ? days.filter((day) => day.date === selectedDate) : days,
    counts: { mapped: scopedPlaces.filter((place) => place.mapping === "mapped").length, total: scopedPlaces.length },
    provider: { renderer: "maplibre", style_url: "https://tiles.openfreemap.org/styles/positron", browser_key_required: false, geometry: "on_demand",
      attribution: [
        { label: "OpenFreeMap", url: "https://openfreemap.org/" },
        { label: "© OpenMapTiles", url: "https://openmaptiles.org/" },
        { label: "© OpenStreetMap contributors", url: "https://www.openstreetmap.org/copyright" },
        { label: "Powered by Geoapify", url: "https://www.geoapify.com/" },
      ] },
  };
}

/** Call only after requireTripAccess. Read each source by trip_id; never load kits, invites or bookings into the response. */
export async function loadTripMapContext(supabase: SupabaseClient, trip: Trip, date: string | null): Promise<{ full: TripFull; map: TripMap } | null> {
  const [stops, days, lodging, tours] = await Promise.all([
    supabase.from("trip_stops").select("id, trip_id, position, name, latitude, longitude, access_point").eq("trip_id", trip.id).order("position"),
    supabase.from("trip_days").select("id, trip_id, date, stop_id, activity, access_point, access_point_stop_id, origin, origin_stay_id, no_drive").eq("trip_id", trip.id).order("date"),
    loadLodging(supabase, trip), loadTourPlans(supabase, trip.id),
  ]);
  if (stops.error || days.error) throw new Error("Couldn't load map places");
  if (date && !lodging.days.some((day) => day.date === date)) return null;
  if (tours.some((tour) => tour.trip_id !== trip.id || !(days.data ?? []).some((day) => day.id === tour.trip_day_id))) {
    throw new Error("Invalid map tour reference");
  }
  const full: TripFull = {
    trip, stops: (stops.data ?? []) as TripStop[], days: (days.data ?? []) as TripDay[], lodging,
    tour_plans: summarizeTourPlans(tours, (days.data ?? []) as TripDay[]), members: [], kits: [], gear: [],
  };
  validateSources(full);
  const estimates = await tripDriveEstimates(full, supabaseDriveStore(supabase, trip.id), { refresh: false });
  return { full, map: projectTripMap(full, estimates, date) };
}

/** Saved map/list contract; geometry shares the same authorized source loader. */
export async function loadTripMap(supabase: SupabaseClient, trip: Trip, date: string | null): Promise<TripMap | null> {
  return (await loadTripMapContext(supabase, trip, date))?.map ?? null;
}
