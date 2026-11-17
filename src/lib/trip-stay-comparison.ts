import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { driveMatrix } from "@/lib/locations/routing";
import { tripActivityLabel } from "@/lib/trip-activities";
import { departurePlans, DRIVE_ESTIMATE_MAX_AGE_MS, driveDay, durationLabel, type DeparturePlan, type StoredDriveEstimate } from "@/lib/trip-drive";
import { calculateDrives, manualEstimates, newer, routeOf, supabaseDriveStore, type ManualEstimateRow, type ReadyPlan } from "@/lib/trip-drive-estimates";
import { accessPointFor, sameLocation } from "@/lib/trip-location";
import { buildLodging, CREW_STATUSES, dateLabel, dates, isCalendarDate, isUuid, nightsLabel, shiftDate } from "@/lib/trip-lodging";
import { stayWindowChoices } from "@/lib/trip-stay-candidates";
import type {
  Trip, TripDriveRoute, TripFull, TripLocation, TripLodging, TripLodgingNight, TripStay, TripStayCandidate, TripStaySummary,
  TripStayComparison, TripStayComparisonDay, TripStayComparisonDrive, TripStayComparisonOption,
} from "@/types/trips";

/**
 * Compares two or three stays or options (#213) by the drives on the mornings
 * after the same nights. Each option is tried as everyone's stay for those
 * nights, and the trip's own origin rules (#209, #333) say who'd leave from it
 * each morning: a day's own starting point or No drive planned is the same
 * whichever stay is chosen. Nothing is saved but the drives it calculates.
 * See docs/trip-stays.md#comparing-stays-213.
 */

type Matrix = typeof driveMatrix;
type OptionRef = { kind: "stay" | "candidate"; id: string; key: string };

interface ComparisonRequest {
  options: OptionRef[];
  first_night: string;
  checkout: string;
}

/** Where the drives a comparison uses are kept: the trip's (#209), its own, and your estimates. */
export interface ComparisonStore {
  read(): Promise<StoredDriveEstimate[]>;
  write(rows: StoredDriveEstimate[]): Promise<void>;
  manual(): Promise<ManualEstimateRow[]>;
}

/** "a, b and c", as the lodging previews list things. */
const listed = (items: string[]) => items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * `options`: two or three of "stay:<id>" or "candidate:<id>", comma-separated,
 * in the order chosen. `first_night` and `checkout` together, or neither for
 * the trip's own nights.
 */
export function parseComparisonRequest(params: URLSearchParams, trip: Pick<Trip, "start_date" | "end_date">): ComparisonRequest | { error: string; field: string } {
  const keys = (params.get("options") ?? "").split(",").map((key) => key.trim().toLowerCase()).filter(Boolean);
  const options = keys.map((key) => {
    const [kind, id] = key.split(":");
    return (kind === "stay" || kind === "candidate") && isUuid(id) ? { kind, id, key: `${kind}:${id}` } as OptionRef : null;
  });
  if (options.some((option) => !option)) return { error: "Choose stays from this trip to compare.", field: "options" };
  if (options.length < 2 || options.length > 3) return { error: "Choose two or three stays to compare.", field: "options" };
  if (new Set(keys).size !== keys.length) return { error: "Choose each stay once.", field: "options" };
  const first = params.get("first_night"), checkout = params.get("checkout");
  if (!first && !checkout) return { options: options as OptionRef[], ...stayWindowChoices(trip).default_window };
  const window = parseStayWindow(first, checkout, trip);
  return "error" in window ? window : { options: options as OptionRef[], ...window };
}

/** Nights within the trip's, from the pre-trip night, ending on a check-out morning up to the one after the last night. */
export function parseStayWindow(first: unknown, checkout: unknown, trip: Pick<Trip, "start_date" | "end_date">): { first_night: string; checkout: string } | { error: string; field: string } {
  if (!isCalendarDate(first) || first < shiftDate(trip.start_date, -1) || first > trip.end_date) return { error: "Choose a first night from the night before the trip through the last night.", field: "first_night" };
  if (!isCalendarDate(checkout) || checkout <= first || checkout > shiftDate(trip.end_date, 1)) return { error: "Choose a check-out morning after the first night.", field: "checkout" };
  return { first_night: first, checkout };
}

/** An option as compared: a saved stay, or a stay the organizer is considering. */
interface Option {
  ref: OptionRef;
  name: string;
  location: TripLocation | null;
  check_in: string | null;
  check_out: string | null;
  address: string | null;
  property_url: string | null;
  notes: string | null;
  /** The saved stay it is; an option is tried as a stay of its own. */
  stay: TripStaySummary | null;
  candidate: TripStayCandidate | null;
}

/**
 * The trip as it would be with everyone on it those nights staying at
 * `stayId`: the crew, and anyone else already planned for a night. Other
 * nights, and people not on the trip those nights, stay as they are.
 */
function withEveryoneAt(full: TripFull, lodging: TripLodging, stayId: string, extra: TripStay | null, nights: Set<string>): TripFull {
  const row = (date: string, memberId?: string): TripLodgingNight => ({ trip_id: full.trip.id, date, stay_id: stayId, status: "assigned", ...(memberId ? { member_id: memberId } : {}) });
  let assignments: TripLodgingNight[];
  if (lodging.per_member) {
    const moving = lodging.people.filter((person) => person.membership !== "left").flatMap((person) => person.nights
      .filter((night) => nights.has(night.date) && night.state !== "not_on_trip"
        && (CREW_STATUSES.has(person.membership) || lodging.assignments.some((saved) => saved.member_id === person.member_id && saved.date === night.date)))
      .map((night) => `${person.member_id}|${night.date}`));
    const moved = new Set(moving);
    assignments = [...lodging.assignments.filter((saved) => !saved.member_id || !moved.has(`${saved.member_id}|${saved.date}`)),
      ...moving.map((entry) => { const [memberId, date] = entry.split("|"); return row(date, memberId); })];
  } else {
    assignments = [...lodging.assignments.filter((saved) => saved.member_id || !nights.has(saved.date)), ...[...nights].map((date) => row(date))];
  }
  // The people as the plan already orders them.
  const members = lodging.people.map((person, index) => ({ id: person.member_id, display_name: person.display_name, role: person.role,
    status: person.membership, created_at: String(index).padStart(6, "0") }));
  return { ...full, lodging: buildLodging(full.trip, [...lodging.stays, ...extra ? [extra] : []], assignments,
    { members, attendance: lodging.attendance, per_member: lodging.per_member }) };
}

/** Who's staying at a saved stay those nights, as the trip is planned now. */
function stayStatus(lodging: TripLodging, stayId: string, nights: string[]): string {
  const here = lodging.nights.filter((night) => nights.includes(night.date) && night.occupancy.some((group) => group.stay_id === stayId));
  if (!here.length) return "Saved stay · Nobody is staying here these nights";
  const people = new Set(here.flatMap((night) => night.occupancy.filter((group) => group.stay_id === stayId).flatMap((group) => group.member_ids)));
  const count = people.size ? ` · ${plural(people.size, "person", "people")}` : "";
  return here.length === nights.length ? `Chosen for these nights${count}` : `Chosen for ${here.length} of these ${nights.length} nights${count}`;
}

/** "Its nights don't include the night of Sat Oct 10.", or null when they include every night compared. */
function datesNote(option: Option, nights: string[]): string | null {
  if (!option.check_in) return option.stay ? "Its nights aren't set." : null;
  const covered = new Set(dates(option.check_in, option.check_out));
  const missing = nights.filter((night) => !covered.has(night));
  if (!missing.length) return null;
  return `Its ${option.stay ? "dates" : "nights"} don't include ${missing.length === 1 ? "the night of" : "the nights of"} ${listed(missing.map(dateLabel))}.`;
}

/** An option's drive one morning, as the page shows it, with its figure for the totals. */
type Drive = TripStayComparisonDrive & { seconds: number | null; route: TripDriveRoute | null };

function driveOf(key: string, route: TripDriveRoute, seconds: number | null): Drive {
  const base = { option_key: key, state: route.state, longest: false, shortest: false, route, seconds: null, known: false, detail: null };
  switch (route.state) {
    case "available": return { ...base, label: `${route.estimate!.duration_label} · ${route.estimate!.distance_label}`, detail: `Calculated ${route.estimate!.age_label}`, known: true, seconds };
    case "stale": return { ...base, label: `${route.estimate!.duration_label} · ${route.estimate!.distance_label}`, detail: `Not updated: calculated ${route.estimate!.age_label}, and checking again failed` };
    case "manual": return { ...base, label: route.manual!.duration_label, detail: "Organizer's estimate", known: true, seconds };
    case "no_route": return { ...base, label: "No road route", detail: "The router found no road there" };
    default: return { ...base, label: "Drive estimate unavailable", detail: "Try again later" };
  }
}

const missingDrive = (key: string, state: "location_needed" | "approximate_location"): Drive => ({
  option_key: key, state, longest: false, shortest: false, known: false, seconds: null, route: null,
  label: state === "location_needed" ? "Location needed" : "Approximate location",
  detail: state === "location_needed" ? "Set its location to compare drives" : "Choose the exact property for drive times",
});

const minutes = (seconds: number) => Math.round(seconds / 60);

/**
 * The comparison for `request`. Saved stays and options must belong to the
 * trip (404 otherwise). Drives already calculated for the same pair in the
 * last week are reused, from the trip's estimates or earlier comparisons;
 * only the rest are requested, and stored for next time. A provider failure
 * is a drive's state, never zero minutes.
 */
export async function compareStays(full: TripFull, candidates: TripStayCandidate[], request: ComparisonRequest, store: ComparisonStore,
  { now = Date.now(), matrix = driveMatrix }: { now?: number; matrix?: Matrix } = {}): Promise<TripStayComparison | { error: string; status: 404 }> {
  const lodging = full.lodging ?? buildLodging(full.trip, [], []);
  const options: Option[] = [];
  for (const ref of request.options) {
    // An option that has become a saved stay is compared as that stay.
    const stay = lodging.stays.find((saved) => saved.id === ref.id) ?? null;
    const candidate = ref.kind === "candidate" ? candidates.find((saved) => saved.id === ref.id) ?? null : null;
    if ((ref.kind === "stay" || !candidate) && !stay) return { error: ref.kind === "stay" ? "Stay not found in this trip." : "Option not found in this trip.", status: 404 };
    const source = stay ?? candidate!;
    options.push({ ref, name: source.name, location: source.location ?? null, check_in: source.check_in, check_out: source.check_out,
      address: source.address, property_url: source.property_url, notes: source.notes, stay, candidate: stay ? null : candidate });
  }

  const nights = dates(request.first_night, request.checkout);
  const nightSet = new Set(nights);
  const mornings = dates(shiftDate(request.first_night, 1), shiftDate(request.checkout, 1))
    .filter((date) => date >= full.trip.start_date && date <= full.trip.end_date);

  // Each option as everyone's stay for these nights, and the departures that follow.
  const departures = options.map((option) => {
    const extra: TripStay | null = option.stay ? null : {
      id: option.ref.id, trip_id: full.trip.id, name: option.name, check_in: request.first_night, check_out: request.checkout, type: null,
      address: option.address, property_url: option.property_url, check_in_time: null, check_out_time: null, notes: option.notes,
      booking_status: "not_booked", location: option.location, created_at: "", updated_at: "",
    };
    const tried = withEveryoneAt(full, lodging, option.ref.id, extra, nightSet);
    const plans = departurePlans(tried);
    return new Map((tried.lodging?.days ?? []).map((day, index) => [day.date, { plans: plans[index], participants: day.participating_member_ids }]));
  });

  type Pending = { date: string; shared: string | null; notes: string[]; plans: Array<DeparturePlan | "location_needed" | "approximate_location" | null> };
  const pending: Pending[] = mornings.map((date, index) => {
    const day = full.days.find((candidate) => candidate.date === date);
    const point = day ? accessPointFor(full.stops, day) : null;
    let shared: string | null = null;
    if (!day || !full.stops.length) shared = "No destination planned";
    else if (day.no_drive) shared = "No drive planned";
    else if (day.origin) {
      const picked = day.origin_stay_id ? lodging.stays.find((stay) => stay.id === day.origin_stay_id) : undefined;
      shared = `Everyone starts from ${picked?.name ?? day.origin.label} that day, its own starting point`;
    } else if (!point) shared = "Access point not set";
    else if (point.location.precision === "approximate") shared = "Needs the exact entrance or parking";
    const plans = shared ? [] : options.map((option, optionIndex) => {
      const morning = departures[optionIndex].get(date);
      // People here only by their own choice of this stay would leave from it whichever stay is chosen.
      const plan = morning?.plans.find((candidate) => candidate.key === `stay:${option.ref.id}` && candidate.member_ids.some((id) => !candidate.own_member_ids.includes(id)))
        ?? morning?.plans.find((candidate) => candidate.key === `stay:${option.ref.id}` && !candidate.member_ids.length);
      if (!plan) return null;
      if (plan.state === "origin_not_located") return "location_needed" as const;
      if (plan.state === "approximate_origin") return "approximate_location" as const;
      return plan;
    });
    if (!shared && plans.every((plan) => plan === null)) {
      shared = departures[0].get(date)?.participants.length === 0 && lodging.people.length ? "Nobody is taking part that day" : "Everyone has their own starting point that day";
    }
    const notes: string[] = [];
    const repeat = point && mornings.slice(0, index).find((earlier) => {
      const other = full.days.find((candidate) => candidate.date === earlier);
      const otherPoint = other ? accessPointFor(full.stops, other) : null;
      return otherPoint && sameLocation(otherPoint.location, point.location);
    });
    if (!shared && repeat) notes.push(`Same access point as ${dateLabel(repeat)}. Each day's drive counts.`);
    const own = !shared && day ? (full.member_origins ?? []).filter((entry) => entry.trip_day_id === day.id
      && (lodging.days.find((context) => context.date === date)?.participating_member_ids ?? []).includes(entry.member_id)).length : 0;
    if (own) notes.push(`${plural(own, "person starts", "people start")} from their own starting point that morning, whichever stay is chosen.`);
    return { date, shared, notes, plans: shared ? [] : plans };
  });

  // Every drive that can be estimated, reusing any calculated for the same pair in the last week.
  const ready = [...new Map(pending.flatMap((day) => day.plans).filter((plan): plan is DeparturePlan & ReadyPlan => typeof plan === "object" && plan?.state === "ready")
    .map((plan) => [routeOf(plan), plan])).values()];
  const [stored, manual] = await Promise.all([store.read().catch(() => []), manualEstimates(full, store)]);
  const byRoute = new Map<string, StoredDriveEstimate>();
  for (const row of stored) byRoute.set(row.route_key, newer(byRoute.get(row.route_key), row));
  const reuse = (plan: ReadyPlan) => { const row = byRoute.get(plan.route_key); return row && { ...row, date: plan.date }; };
  const due = ready.filter((plan) => { const row = reuse(plan); return !row || now - Date.parse(row.calculated_at) > DRIVE_ESTIMATE_MAX_AGE_MS; });
  const { calculated, failed } = await calculateDrives(due, matrix, now);
  const writes = [...new Map([...calculated.values()].map((row) => [row.route_key, row])).values()];
  if (writes.length) await store.write(writes).catch(() => undefined);

  const days: Array<Omit<TripStayComparisonDay, "drives"> & { drives: Drive[] }> = pending.map(({ date, shared, notes, plans }) => {
    const day = full.days.find((candidate) => candidate.date === date);
    const stop = day ? full.stops.find((candidate) => candidate.id === day.stop_id) ?? full.stops[0] : undefined;
    const point = day ? accessPointFor(full.stops, day) : null;
    const drives = plans.map((plan, index): Drive => {
      const key = options[index].ref.key;
      if (plan === "location_needed" || plan === "approximate_location") return missingDrive(key, plan);
      // Nobody would leave from here that morning, so it has no drive to count.
      if (!plan) return { option_key: key, state: "no_drive", label: "No drive from here that morning", detail: null, known: false, longest: false, shortest: false, seconds: null, route: null };
      if (plan.state !== "ready") return driveOf(key, driveDay(plan, undefined, false, now), null);
      const row = calculated.get(routeOf(plan)) ?? reuse(plan);
      const route = driveDay(plan, row, failed.has(routeOf(plan)), now, { manual });
      const seconds = route.state === "manual" ? route.manual!.duration_seconds : row?.status === "ok" ? row.duration_seconds : null;
      return driveOf(key, route, seconds);
    });
    // Shortest that morning only when every option's drive is known and they differ.
    if (drives.length > 1 && drives.every((drive) => drive.known)) {
      const low = Math.min(...drives.map((drive) => minutes(drive.seconds!)));
      if (drives.some((drive) => minutes(drive.seconds!) > low)) drives.forEach((drive) => { drive.shortest = minutes(drive.seconds!) === low; });
    }
    return {
      date, date_label: dateLabel(date), activity_label: day?.activity ? tripActivityLabel(day.activity) : null,
      stop_label: stop?.name ?? null, destination_label: point?.location.label ?? null, checkout: date === request.checkout,
      shared, notes, drives,
    };
  });

  const comparedOptions = options.map((option, index): TripStayComparisonOption => {
    const drives = days.flatMap((day) => day.shared || day.drives[index].state === "no_drive" ? [] : [{ day, drive: day.drives[index] }]);
    const known = drives.filter((entry) => entry.drive.known);
    const longest = known.reduce<typeof known[number] | null>((best, entry) => !best || entry.drive.seconds! > best.drive.seconds! ? entry : best, null);
    if (longest) longest.drive.longest = true;
    const complete = drives.length > 0 && known.length === drives.length;
    const unknown = drives.length - known.length;
    const location = option.location;
    const cost = option.candidate?.cost_label ? {
      label: option.candidate.cost_label,
      note: option.candidate.check_in === request.first_night && option.candidate.check_out === request.checkout ? null : "Its estimate is for other nights than these.",
    } : null;
    return {
      key: option.ref.key, kind: option.stay ? "stay" : "candidate", id: option.ref.id, name: option.name,
      date_label: !option.check_in ? "Nights not set" : `${option.stay ? "Saved for" : "Considered for"} ${option.stay ? option.stay.date_label : option.candidate!.date_label}`,
      dates_note: datesNote(option, nights),
      status_label: option.stay ? stayStatus(lodging, option.stay.id, nights) : "Option you're considering · Not chosen for any nights",
      booking_label: option.stay ? (option.stay.booking_status === "booked" ? "Booked" : "Booking not confirmed") : "No booking recorded",
      location_note: !location ? "Location needed for drive times" : location.precision === "approximate" ? "Approximate area · choose the exact property for drive times" : null,
      address: option.address, property_url: option.property_url, notes: option.notes, cost,
      drives_needed: drives.length, drives_known: known.length,
      coverage_label: !drives.length ? "No drives to compare" : complete ? (drives.length === 1 ? "The 1 drive is known" : `All ${drives.length} drives known`) : `${known.length} of ${drives.length} drives known`,
      longest_label: longest ? `${durationLabel(longest.drive.seconds!)} · ${longest.day.date_label}${longest.day.destination_label ? ` to ${longest.day.destination_label}` : ""}` : null,
      sum_label: !drives.length ? "No drives to total"
        : complete ? durationLabel(known.reduce((total, entry) => total + entry.drive.seconds!, 0))
        : `Not totaled: ${unknown === 1 ? "1 drive isn't known" : `${unknown} drives aren't known`}`,
      sum_complete: complete,
    };
  });

  const totals = comparedOptions.map((option, index) => ({ option, total: minutes(days.reduce((sum, day) => sum + (day.shared ? 0 : day.drives[index].seconds ?? 0), 0)) }));
  const comparable = comparedOptions.every((option) => option.sum_complete);
  let summary: string;
  if (!mornings.length) summary = "No trip day follows these nights, so there are no drives to compare.";
  else if (comparedOptions.every((option) => !option.drives_needed)) summary = "There are no drives to compare on these mornings.";
  else if (!comparable) {
    const gaps = comparedOptions.filter((option) => !option.sum_complete)
      .map((option) => `${option.name} (${option.location_note && !option.drives_known ? "no location" : plural(option.drives_needed - option.drives_known, "drive", "drives")})`);
    summary = `Sums aren't compared until every drive is known. Not known yet: ${listed(gaps)}. A missing drive never counts as zero.`;
  } else {
    const low = Math.min(...totals.map((entry) => entry.total));
    const lowest = totals.filter((entry) => entry.total === low);
    summary = lowest.length === totals.length
      ? `${totals.length === 2 ? "Both" : "All three"} have the same sum of planned outbound drives: ${durationLabel(low * 60)}.`
      : `${listed(lowest.map((entry) => entry.option.name))} ${lowest.length === 1 ? "has" : "have"} the lowest sum of planned outbound drives, ${durationLabel(low * 60)}. `
        + totals.filter((entry) => entry.total !== low).map((entry) => `${entry.option.name}: ${durationLabel((entry.total - low) * 60)} more.`).join(" ");
  }

  const currencies = new Set(options.flatMap((option) => option.candidate?.cost_label ? [option.candidate.cost_currency] : []));
  const routes = days.flatMap((day) => day.drives.flatMap((drive) => drive.route ? [drive.route] : []));
  return {
    window: {
      first_night: request.first_night, checkout: request.checkout, label: nightsLabel(request.first_night, nights.length),
      mornings_label: mornings.length ? `Mornings compared: ${listed(mornings.map((date) => `${dateLabel(date)}${date === request.checkout ? " (check-out)" : ""}`))}` : "No trip mornings follow these nights",
      nights: nights.map((date) => {
        const night = lodging.nights.find((entry) => entry.date === date);
        const booked = (night?.occupancy ?? []).flatMap((group) => lodging.stays.find((stay) => stay.id === group.stay_id && stay.booking_status === "booked")?.name ?? []);
        return { date, date_label: dateLabel(date), current: night?.label ?? "Not planned yet", booked };
      }),
    },
    options: comparedOptions,
    days: days.map((day) => ({ ...day, drives: day.drives.map(({ option_key, state, label, detail, known, longest, shortest }) => ({ option_key, state, label, detail, known, longest, shortest })) })),
    summary, comparable,
    cost_note: currencies.size > 1 ? "Costs are in different currencies, so they aren't compared." : null,
    closures: [...new Set(routes.flatMap((route) => route.closures))],
    credit: routes.some((route) => route.state === "available" || route.state === "stale" || route.state === "no_route"),
  };
}

const COLUMNS = "route_key, origin_label, destination_label, status, duration_seconds, distance_meters, calculated_at";

/**
 * The trip's drive estimates (#209), read only, and the comparison's own in
 * trip_stay_candidate_routes. Before the candidates migration that table is
 * missing: reads find nothing and writes are skipped, so each comparison
 * calculates its drives again.
 */
export function supabaseComparisonStore(supabase: SupabaseClient, tripId: string): ComparisonStore {
  const trip = supabaseDriveStore(supabase, tripId);
  const table = () => supabase.from("trip_stay_candidate_routes");
  return {
    async read() {
      const [estimates, own] = await Promise.all([trip.read(), table().select(COLUMNS).eq("trip_id", tripId)]);
      return [...estimates, ...own.error ? [] : ((own.data ?? []) as Omit<StoredDriveEstimate, "date">[]).map((row) => ({ ...row, date: "" }))];
    },
    async write(rows) {
      await table().upsert(rows.map((row) => ({ trip_id: tripId, route_key: row.route_key, origin_label: row.origin_label, destination_label: row.destination_label,
        status: row.status, duration_seconds: row.duration_seconds, distance_meters: row.distance_meters, calculated_at: row.calculated_at, provider: "geoapify" })),
      { onConflict: "trip_id,route_key" });
    },
    manual: () => trip.manual!(),
  };
}
