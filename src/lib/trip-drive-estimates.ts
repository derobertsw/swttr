import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { driveMatrix, MATRIX_MAX_CELLS } from "@/lib/locations/routing";
import {
  closureKey, departurePlans, DRIVE_ESTIMATE_MAX_AGE_MS, driveDay, drivePlans, stayDepartures,
  type DeparturePlan, type DrivePlan, type StoredDriveEstimate, type StoredManualEstimate,
} from "@/lib/trip-drive";
import type { TripDriveDeparture, TripDriveEstimates, TripFull, TripLocation } from "@/types/trips";

/** Your estimate as trip_drive_manual_estimates (029) keeps it: with its day, which can move to another date. */
export type ManualEstimateRow = Omit<StoredManualEstimate, "date"> & { trip_day_id: string };

/** Where estimates are kept between visits: trip_drive_estimates (028), and your own in 029's table. */
export interface DriveEstimateStore {
  /** Every stored estimate: one per day and pair, or one per day before the departures migration. */
  read(): Promise<StoredDriveEstimate[]>;
  /** One row per day and pair, each day's crew estimate before the others. */
  write(rows: StoredDriveEstimate[]): Promise<void>;
  /** Your own estimates; none before migration 029. */
  manual?(): Promise<ManualEstimateRow[]>;
}

/** Your estimates by their day's current date. */
async function manualEstimates(full: TripFull, store: DriveEstimateStore): Promise<StoredManualEstimate[]> {
  const rows = await (store.manual?.() ?? Promise.resolve([])).catch(() => []);
  return rows.flatMap(({ trip_day_id: dayId, ...row }) => {
    const day = full.days.find((candidate) => candidate.id === dayId);
    return day ? [{ ...row, date: day.date }] : [];
  });
}

type ReadyPlan = Extract<DrivePlan, { state: "ready" }>;
type Matrix = typeof driveMatrix;

const pointKey = (location: TripLocation) => `${location.latitude},${location.longitude}`;
/** Identical calculations requested at the same time share one provider call. */
const matricesInFlight = new Map<string, ReturnType<Matrix>>();

/**
 * Splits days that avoid the same closures into calls within the provider's
 * cell limit. Each call asks only for the stays and access points its own
 * days use, with each stay's days kept together where they fit.
 */
function batches(plans: ReadyPlan[]): ReadyPlan[][] {
  const result: ReadyPlan[][] = [];
  let batch: ReadyPlan[] = [];
  let origins = new Set<string>(), targets = new Set<string>();
  const byOrigin = [...plans].sort((a, b) => pointKey(a.origin!.location!).localeCompare(pointKey(b.origin!.location!)));
  for (const plan of byOrigin) {
    const origin = pointKey(plan.origin!.location!), target = pointKey(plan.destination!.location);
    const cells = (origins.size + (origins.has(origin) ? 0 : 1)) * (targets.size + (targets.has(target) ? 0 : 1));
    if (batch.length && cells > MATRIX_MAX_CELLS) {
      result.push(batch);
      batch = []; origins = new Set(); targets = new Set();
    }
    batch.push(plan); origins.add(origin); targets.add(target);
  }
  if (batch.length) result.push(batch);
  return result;
}

function sharedMatrix(matrix: Matrix, ...args: Parameters<Matrix>): ReturnType<Matrix> {
  const key = JSON.stringify(args);
  const existing = matricesInFlight.get(key);
  if (existing) return existing;
  const pending = matrix(...args).finally(() => matricesInFlight.delete(key));
  matricesInFlight.set(key, pending);
  return pending;
}

const routeOf = (plan: DrivePlan | StoredDriveEstimate) => `${plan.date}|${plan.route_key}`;
const newer = (a: StoredDriveEstimate | undefined, b: StoredDriveEstimate) => !a || Date.parse(b.calculated_at) > Date.parse(a.calculated_at) ? b : a;

/**
 * Every trip day's drive estimates and each stay's departures (#209): the
 * crew's departure, and since #333 each group that starts somewhere else.
 * A stored estimate for the same pair, from any day, is reused for a week, so
 * changing one person's stay calculates only the drive that's new. The rest
 * are calculated, one provider call per set of winter closures (more when a
 * call would pass the provider's cell limit), and stored. A failed
 * calculation keeps a stale estimate for the same pair, or says the estimate
 * is unavailable; it's never replaced by another pair's.
 */
export async function tripDriveEstimates(full: TripFull, store: DriveEstimateStore, options: { now?: number; matrix?: Matrix; refresh?: boolean } = {}): Promise<TripDriveEstimates> {
  const now = options.now ?? Date.now();
  const matrix = options.matrix ?? driveMatrix;
  const plans = drivePlans(full);
  const departures = departurePlans(full, plans);
  const [storedRows, manual] = await Promise.all([store.read().catch(() => []), manualEstimates(full, store)]);
  // The latest estimate for each pair, whichever day it was calculated for,
  // so an expired one for this day never hides a fresh one from another.
  const byRoute = new Map<string, StoredDriveEstimate>();
  for (const row of storedRows) byRoute.set(row.route_key, newer(byRoute.get(row.route_key), row));
  const reuse = (plan: DrivePlan) => {
    const row = plan.route_key ? byRoute.get(plan.route_key) : undefined;
    return row && { ...row, date: plan.date };
  };
  const ready = [...new Map(departures.flat().filter((plan): plan is DeparturePlan & ReadyPlan => plan.state === "ready")
    .map((plan) => [routeOf(plan), plan])).values()];
  const due = options.refresh === false ? [] : ready.filter((plan) => {
    const row = reuse(plan);
    return !row || now - Date.parse(row.calculated_at) > DRIVE_ESTIMATE_MAX_AGE_MS;
  });

  const calculated = new Map<string, StoredDriveEstimate>();
  // Read-only map views label expired estimates stale without spending routing credits.
  const failed = new Set<string>(options.refresh === false ? ready.map(routeOf) : []);
  const calculatedAt = new Date(now).toISOString();
  const groups = new Map<string, ReadyPlan[]>();
  for (const plan of due) {
    const closures = closureKey(plan.closures);
    groups.set(closures, [...groups.get(closures) ?? [], plan]);
  }
  await Promise.all([...groups.values()].flatMap(batches).map(async (group) => {
    const origins = [...new Map(group.map((plan) => [pointKey(plan.origin!.location!), plan.origin!.location!])).values()];
    const targets = [...new Map(group.map((plan) => [pointKey(plan.destination!.location), plan.destination!.location])).values()];
    const avoid = group[0].closures.flatMap((closure) => closure.points);
    let legs: Awaited<ReturnType<Matrix>>;
    try {
      legs = await sharedMatrix(matrix, origins, targets, avoid);
    } catch {
      group.forEach((plan) => failed.add(routeOf(plan)));
      return;
    }
    for (const plan of group) {
      const leg = legs[origins.findIndex((point) => pointKey(point) === pointKey(plan.origin!.location!))]
        ?.[targets.findIndex((point) => pointKey(point) === pointKey(plan.destination!.location))];
      calculated.set(routeOf(plan), {
        date: plan.date, route_key: plan.route_key,
        origin_label: plan.origin!.label, destination_label: plan.destination!.label,
        status: leg ? "ok" : "no_route", duration_seconds: leg?.seconds ?? null, distance_meters: leg?.meters ?? null,
        calculated_at: calculatedAt,
      });
    }
  }));

  const rowFor = (plan: DeparturePlan) => calculated.get(routeOf(plan)) ?? reuse(plan) ?? earlier(plan);
  /**
   * With no estimate for its pair, a departure's earlier estimate on the same
   * day, for review only: one from the same starting point (the access point
   * moved), or for the crew, the latest the day had (the crew moved stays).
   */
  const earlier = (plan: DeparturePlan) => {
    const current = new Set(departures.find((day) => day[0].date === plan.date)!.map((other) => other.route_key));
    const candidates = storedRows.filter((row) => row.date === plan.date && !current.has(row.route_key))
      .sort((a, b) => Date.parse(b.calculated_at) - Date.parse(a.calculated_at));
    return candidates.find((row) => row.origin_label === plan.origin?.label) ?? (plan.crew ? candidates[0] : undefined);
  };
  // Each day's crew estimate goes first, and goes with any other departure
  // written for its day, so a table that keeps one estimate per day (before
  // the departures migration) keeps the crew's rather than the last written.
  // One newly calculated, or reused from another day, is stored as this day's
  // own. A failed write only means the next visit calculates again.
  const writtenDays = new Set([...calculated.values()].map((row) => row.date));
  const crewRows = departures.flatMap((day) => day.filter((plan) => plan.crew && plan.state === "ready")).flatMap((plan) => {
    const row = calculated.get(routeOf(plan)) ?? reuse(plan);
    const kept = row && byRoute.get(plan.route_key!)?.date === plan.date && !calculated.has(routeOf(plan));
    return row && (!kept || writtenDays.has(plan.date)) ? [row] : [];
  });
  const writes = [...new Map([...crewRows, ...calculated.values()].map((row) => [routeOf(row), row])).values()];
  if (writes.length && options.refresh !== false) await store.write(writes).catch(() => undefined);

  return {
    days: departures.map((day) => {
      const routes = day.map((plan) => {
        // Your estimate is the crew's (#209): another departure uses it only for the same drive.
        const own = manual.filter((entry) => entry.date === plan.date && entry.pair_key === plan.pair_key);
        const context = plan.crew ? { plans, manual } : { plans: [plan], manual: own };
        return driveDay(plan, rowFor(plan), failed.has(routeOf(plan)), now, context);
      });
      return {
        ...routes[day.findIndex((plan) => plan.crew)],
        departures: routes.map((route, index): TripDriveDeparture => ({
          ...route, key: day[index].key, label: day[index].label, member_ids: day[index].member_ids, crew: day[index].crew,
        })),
      };
    }),
    stays: stayDepartures(full, now, departures),
  };
}

const COLUMNS = "date, route_key, origin_label, destination_label, status, duration_seconds, distance_meters, calculated_at";
const MANUAL_COLUMNS = "trip_day_id, pair_key, origin_label, destination_label, duration_seconds, note, use_calculated, entered_at";

/** Postgres: no unique constraint matches the ON CONFLICT columns. */
const NO_MATCHING_KEY = "42P10";

/**
 * trip_drive_estimates and trip_drive_manual_estimates through the server's
 * client. Before migration 028 the first is missing: reads find nothing and
 * writes are skipped, so estimates are still calculated, just not kept.
 * Before the departures migration (20261023000200) it keeps one estimate per
 * day, so only each day's crew estimate is kept and other departures are
 * calculated again on the next visit.
 */
export function supabaseDriveStore(supabase: SupabaseClient, tripId: string): DriveEstimateStore {
  const table = () => supabase.from("trip_drive_estimates");
  return {
    async read() {
      const { data, error } = await table().select(COLUMNS).eq("trip_id", tripId);
      return error ? [] : (data ?? []) as StoredDriveEstimate[];
    },
    async write(rows) {
      const saved = rows.map((row) => ({ ...row, trip_id: tripId, provider: "geoapify" }));
      const { error } = await table().upsert(saved, { onConflict: "trip_id,date,route_key" });
      if (error?.code !== NO_MATCHING_KEY) return;
      const perDay = [...new Map([...saved].reverse().map((row) => [row.date, row])).values()];
      await table().upsert(perDay, { onConflict: "trip_id,date" });
    },
    // Before migration 029 the table is missing, and there are none.
    async manual() {
      const { data, error } = await supabase.from("trip_drive_manual_estimates").select(MANUAL_COLUMNS).eq("trip_id", tripId);
      return error ? [] : (data ?? []) as ManualEstimateRow[];
    },
  };
}
