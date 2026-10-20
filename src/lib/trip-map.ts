import "server-only";
import { createHash } from "node:crypto";
import { driveDay, drivePlans, type DrivePlan } from "@/lib/trip-drive";
import type { DriveEstimateStore } from "@/lib/trip-drive-estimates";
import { accessPointFor, GEOAPIFY_CREDIT, OSM_CREDIT } from "@/lib/trip-location";
import { dateLabel } from "@/lib/trip-lodging";
import type { TripFull, TripLocation } from "@/types/trips";
import type { TripMapData, TripMapDay, TripMapPlace, TripMapRole } from "@/types/trip-map";

const revision = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const stayId = (id: string) => `stay:${id}:location`;
const stopId = (id: string) => `stop:${id}:destination`;
const accessId = (kind: "day" | "stop", id: string) => `${kind}:${id}:access_point`;

/** Service-role reads must not trust foreign keys to scope every reference. */
function assertMapReferences(full: TripFull): void {
  const tripId = full.trip.id, stops = new Set(full.stops.map((s) => s.id));
  const stays = new Set(full.lodging?.stays.map((s) => s.id) ?? []), days = new Set(full.days.map((d) => d.id));
  const invalid = full.stops.some((s) => s.trip_id !== tripId)
    || full.days.some((d) => d.trip_id !== tripId || (d.stop_id !== null && !stops.has(d.stop_id))
      || (d.origin_stay_id != null && !stays.has(d.origin_stay_id)))
    || (full.lodging?.stays.some((s) => s.trip_id !== tripId) ?? false)
    || (full.lodging?.assignments.some((n) => n.trip_id !== tripId || (n.stay_id !== null && !stays.has(n.stay_id))) ?? false)
    || (full.lodging?.days.some((d) => !full.days.some((day) => day.date === d.date)
      || (d.starting_stay_id !== null && !stays.has(d.starting_stay_id)) || (d.tonight_stay_id !== null && !stays.has(d.tonight_stay_id))) ?? false)
    || (full.tour_plans?.some((p) => p.trip_id !== tripId || !days.has(p.trip_day_id)) ?? false);
  if (invalid) throw new Error("Invalid trip map references");
  // #176 can remove/reassign a stop while retaining an inactive own access
  // point. accessPointFor discards it; never expose or follow that old ID.
}

/** Reads permit genuine zeros, never coerce null/string/missing values to zero. */
function coordinates(latitude: unknown, longitude: unknown): Pick<TripMapPlace, "coordinates" | "mapping"> {
  if (latitude == null || longitude == null) return { coordinates: null, mapping: "missing_coordinates" };
  if (typeof latitude !== "number" || typeof longitude !== "number" || !Number.isFinite(latitude) || !Number.isFinite(longitude)
    || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return { coordinates: null, mapping: "invalid_coordinates" };
  return { coordinates: { latitude, longitude }, mapping: "mapped" };
}

function place(source: TripMapPlace["source"], label: string, location?: TripLocation | null): TripMapPlace {
  return {
    id: `${source.kind}:${source.id}:${source.field}`, source, label, address: location?.address ?? null,
    ...coordinates(location?.latitude, location?.longitude), precision: location?.precision ?? "unknown",
    provenance: { source: location?.source ?? null, provider: location?.provider ?? null,
      provider_id: location?.provider_id ?? null, attribution: location?.attribution ?? null },
    dates: [], nights: [], night_range: null, associations: [],
  };
}

/** Same role resolution as #209, with malformed saved coordinates blocked before routing. */
export function mapDrivePlans(full: TripFull): DrivePlan[] {
  return drivePlans(full).map((plan) => {
    if (plan.state !== "ready") return plan;
    const origin = plan.origin!.location!, target = plan.destination!.location;
    const state = coordinates(origin.latitude, origin.longitude).mapping !== "mapped" ? "origin_not_located"
      : coordinates(target.latitude, target.longitude).mapping !== "mapped" ? "missing_access_point" : null;
    return state ? { ...plan, state, route_key: null, pair_key: null, closures: [] } : plan;
  });
}

/**
 * Shared map/list projection. No provider calls, booking details, kits or invite
 * tokens. Estimates are #209's cached/manual states; its API owns refreshing.
 */
export async function tripMapData(full: TripFull, store: DriveEstimateStore, selectedDate?: string, now = Date.now()): Promise<TripMapData> {
  assertMapReferences(full);
  const plans = mapDrivePlans(full);
  const [stored, manualRows] = await Promise.all([store.read().catch(() => []), (store.manual?.() ?? Promise.resolve([])).catch(() => [])]);
  const manual = manualRows.flatMap(({ trip_day_id, ...row }) => {
    const day = full.days.find((d) => d.id === trip_day_id);
    return day ? [{ ...row, date: day.date }] : [];
  });
  const places = new Map<string, TripMapPlace>();
  for (const stay of full.lodging?.stays ?? []) {
    if (!stay.assigned_nights.length && !plans.some((plan) => plan.origin?.stay_id === stay.id)) continue;
    const saved = place({ kind: "stay", id: stay.id, field: "location" }, stay.name, stay.location);
    saved.address = stay.location?.address ?? stay.address;
    saved.nights = [...stay.assigned_nights];
    saved.night_range = { check_in: stay.check_in, check_out: stay.check_out };
    places.set(saved.id, saved);
  }
  for (const stop of full.stops) {
    const saved = place({ kind: "stop", id: stop.id, field: "destination" }, stop.name);
    Object.assign(saved, coordinates(stop.latitude, stop.longitude));
    saved.provenance.source = "legacy_destination";
    places.set(saved.id, saved);
    if (stop.access_point) {
      const access = place({ kind: "stop", id: stop.id, field: "access_point" }, stop.access_point.label, stop.access_point);
      places.set(access.id, access);
    }
  }
  const associate = (id: string | null, dayId: string, date: string, role: TripMapRole) => {
    const saved = id ? places.get(id) : null;
    if (!saved) return;
    saved.associations.push({ day_id: dayId, date, role });
    if (!saved.dates.includes(date)) saved.dates.push(date);
  };
  const days: TripMapDay[] = full.days.map((day) => {
    const stop = full.stops.find((s) => s.id === day.stop_id) ?? full.stops[0];
    const lodging = full.lodging?.days.find((d) => d.date === day.date);
    const plan = plans.find((p) => p.date === day.date);
    const tour = full.tour_plans?.find((p) => p.trip_day_id === day.id);
    const point = accessPointFor(full.stops, day);
    let access: string | null = null;
    if (point && stop) {
      access = accessId(point.scope, point.scope === "day" ? day.id : stop.id);
      if (!places.has(access)) places.set(access, place({ kind: "day", id: day.id, field: "access_point" }, point.location.label, point.location));
    }
    let origin = plan?.origin?.stay_id ? stayId(plan.origin.stay_id) : null;
    if (!origin && day.origin) {
      const saved = place({ kind: "day", id: day.id, field: "origin" }, day.origin.label, day.origin);
      places.set(saved.id, saved); origin = saved.id;
    }
    const refs = { destination: stop ? stopId(stop.id) : null, origin, access,
      crew_stay: lodging?.starting_stay_id ? stayId(lodging.starting_stay_id) : null,
      tonight: lodging?.tonight_stay_id ? stayId(lodging.tonight_stay_id) : null,
      meeting: tour ? access : null, pickup: null };
    for (const role of ["destination", "origin", "access", "tonight", "meeting"] as const) associate(refs[role], day.id, day.date, role);
    associate(refs.crew_stay, day.id, day.date, "stay");
    const drive = plan ? driveDay(plan, stored.find((r) => r.date === day.date), true, now, { plans, manual })
      : { date: day.date, date_label: dateLabel(day.date), night_label: "", state: "missing_origin" as const,
        origin: null, crew_stay: null, destination: null, estimate: null, manual: null, previous: null, pair_key: null, same_drive_dates: [], closures: [], directions: null };
    const context = { id: day.id, date: day.date, date_label: dateLabel(day.date), ...refs,
      pickup_state: tour?.pickup_notes ? "notes_only" as const : "not_set" as const,
      starting_from: plan?.origin?.label ?? lodging?.starting_from ?? "Not set",
      staying_tonight: lodging?.staying_tonight ?? "Not planned yet",
      tonight_state: full.lodging?.nights.find((n) => n.date === day.date)?.status ?? "unplanned",
      meet_label: tour?.meet_label ?? null };
    // Do not hash age labels (which change with the clock), booking data or kits.
    const dayRevision = revision({ context, no_drive: day.no_drive ?? false, route_key: plan?.route_key,
      places: [...new Set(Object.values(refs))].filter((id): id is string => id !== null).map((id) => {
        const saved = places.get(id)!;
        return { id, label: saved.label, coordinates: saved.coordinates, mapping: saved.mapping, precision: saved.precision, provenance: saved.provenance };
      }) });
    return { ...context, revision: dayRevision, drive };
  });
  const savedPlaces = [...places.values()];
  // The map snapshot also changes when estimates/preferences change. Keep
  // those separate from the day revision used to bind unchanged geometry.
  const driveRevisions = days.map(({ revision, drive }) => ({ revision, drive: {
    ...drive,
    estimate: drive.estimate && { ...drive.estimate, age_label: undefined },
    previous: drive.previous && { ...drive.previous, age_label: undefined },
  } }));
  return {
    trip_id: full.trip.id, revision: revision({ places: savedPlaces, days: driveRevisions }), places: savedPlaces, days,
    selected_day: days.find((d) => d.date === selectedDate) ?? null,
    provider: { renderer: "maplibre", style_url: "https://tiles.openfreemap.org/styles/positron", attribution: [
      { label: "OpenFreeMap", url: "https://openfreemap.org/" }, { label: "© OpenMapTiles", url: "https://openmaptiles.org/" }, OSM_CREDIT, GEOAPIFY_CREDIT,
    ] },
  };
}
