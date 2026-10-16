import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { driveMatrix, MATRIX_MAX_CELLS } from "@/lib/locations/routing";
import {
  closureKey, DRIVE_ESTIMATE_MAX_AGE_MS, driveDay, drivePlans, stayDepartures,
  type DrivePlan, type StoredDriveEstimate, type StoredManualEstimate,
} from "@/lib/trip-drive";
import type { TripDriveEstimates, TripFull, TripLocation } from "@/types/trips";

/** Your estimate as trip_drive_manual_estimates (029) keeps it: with its day, which can move to another date. */
export type ManualEstimateRow = Omit<StoredManualEstimate, "date"> & { trip_day_id: string };

/** Where estimates are kept between visits: trip_drive_estimates (028), and your own in 029's table. */
export interface DriveEstimateStore {
  read(): Promise<StoredDriveEstimate[]>;
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

/**
 * Every trip day's drive estimate and each stay's departures (#209).
 * Stored estimates for the same pair are reused for a week. The rest are
 * calculated, one provider call per set of winter closures (more when a
 * call would pass the provider's cell limit), and stored. A
 * failed calculation keeps a stale estimate for the same pair, or says the
 * estimate is unavailable; it's never replaced by another pair's.
 */
export async function tripDriveEstimates(full: TripFull, store: DriveEstimateStore, options: { now?: number; matrix?: Matrix } = {}): Promise<TripDriveEstimates> {
  const now = options.now ?? Date.now();
  const matrix = options.matrix ?? driveMatrix;
  const plans = drivePlans(full);
  const [storedRows, manual] = await Promise.all([store.read().catch(() => []), manualEstimates(full, store)]);
  const stored = new Map(storedRows.map((row) => [row.date, row]));
  const due = plans.filter((plan): plan is ReadyPlan => {
    if (plan.state !== "ready") return false;
    const row = stored.get(plan.date);
    return row?.route_key !== plan.route_key || now - Date.parse(row.calculated_at) > DRIVE_ESTIMATE_MAX_AGE_MS;
  });

  const calculated = new Map<string, StoredDriveEstimate>();
  const failed = new Set<string>();
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
      group.forEach((plan) => failed.add(plan.date));
      return;
    }
    for (const plan of group) {
      const leg = legs[origins.findIndex((point) => pointKey(point) === pointKey(plan.origin!.location!))]
        ?.[targets.findIndex((point) => pointKey(point) === pointKey(plan.destination!.location))];
      calculated.set(plan.date, {
        date: plan.date, route_key: plan.route_key,
        origin_label: plan.origin!.label, destination_label: plan.destination!.label,
        status: leg ? "ok" : "no_route", duration_seconds: leg?.seconds ?? null, distance_meters: leg?.meters ?? null,
        calculated_at: calculatedAt,
      });
    }
  }));
  // A failed write only means the next visit calculates again.
  if (calculated.size) await store.write([...calculated.values()]).catch(() => undefined);

  return {
    days: plans.map((plan) => driveDay(plan, calculated.get(plan.date) ?? stored.get(plan.date), failed.has(plan.date), now, { plans, manual })),
    stays: stayDepartures(full, now, plans),
  };
}

const COLUMNS = "date, route_key, origin_label, destination_label, status, duration_seconds, distance_meters, calculated_at";
const MANUAL_COLUMNS = "trip_day_id, pair_key, origin_label, destination_label, duration_seconds, note, use_calculated, entered_at";

/**
 * trip_drive_estimates and trip_drive_manual_estimates through the server's
 * client. Before migration 028 the first is missing: reads find nothing and
 * writes are skipped, so estimates are still calculated, just not kept.
 */
export function supabaseDriveStore(supabase: SupabaseClient, tripId: string): DriveEstimateStore {
  return {
    async read() {
      const { data, error } = await supabase.from("trip_drive_estimates").select(COLUMNS).eq("trip_id", tripId);
      return error ? [] : (data ?? []) as StoredDriveEstimate[];
    },
    async write(rows) {
      await supabase.from("trip_drive_estimates")
        .upsert(rows.map((row) => ({ ...row, trip_id: tripId, provider: "geoapify" })), { onConflict: "trip_id,date" });
    },
    // Before migration 029 the table is missing, and there are none.
    async manual() {
      const { data, error } = await supabase.from("trip_drive_manual_estimates").select(MANUAL_COLUMNS).eq("trip_id", tripId);
      return error ? [] : (data ?? []) as ManualEstimateRow[];
    },
  };
}
