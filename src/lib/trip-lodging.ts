import "server-only";
import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseTripLocation } from "@/lib/trip-location";
import type {
  Trip, TripLocation, TripLodging, TripLodgingAction, TripLodgingCrewNight, TripLodgingGroup, TripLodgingNight, TripLodgingPerson,
  TripLodgingPreview, TripLodgingState, TripMember, TripMemberAttendance, TripPersonChangeover, TripPersonDay, TripPersonNight,
  TripPersonRun, TripStay, TripStayInput,
} from "@/types/trips";

export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1000-01-01") return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export const isUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export const shiftDate = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
export const dateLabel = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).replace(",", "");
/** Consecutive nights as a stay's dates read: "Fri Oct 9 → Sun Oct 11 · 2 nights", ending on the check-out morning. */
const nightsLabel = (first: string, count: number) => `${dateLabel(first)} → ${dateLabel(shiftDate(first, count))} · ${count} ${count === 1 ? "night" : "nights"}`;
/** Each date from `start` up to, not including, `end`. */
export function dates(start: string | null, end: string | null): string[] {
  if (!start || !end) return [];
  const result: string[] = [];
  for (let date = start; date < end; date = shiftDate(date, 1)) result.push(date);
  return result;
}

export function parseStay(value: unknown): TripStayInput | { error: string; field: string } {
  if (!value || typeof value !== "object") return { error: "Enter a stay name.", field: "name" };
  const input = value as Record<string, unknown>;
  if (!isUuid(input.id)) return { error: "Invalid stay identity. Reopen the stay editor.", field: "name" };
  const text = (key: string, max: number) => input[key] == null || input[key] === "" ? null : typeof input[key] === "string" && input[key].trim().length <= max ? input[key].trim() || null : undefined;
  const name = text("name", 200);
  if (!name) return { error: "Stay name must be 1–200 characters.", field: "name" };
  const checkIn = input.check_in === "" ? null : input.check_in ?? null, checkOut = input.check_out === "" ? null : input.check_out ?? null;
  if (checkIn !== null || checkOut !== null) {
    if (!isCalendarDate(checkIn)) return { error: "Choose a valid check-in date, or clear both dates.", field: "check_in" };
    if (!isCalendarDate(checkOut) || checkOut <= checkIn) return { error: "Check-out must be after check-in. Clear both dates to save without dates.", field: "check_out" };
    if ((Date.parse(checkOut) - Date.parse(checkIn)) / 86400000 > 366) return { error: "Choose a stay of up to 366 nights.", field: "check_out" };
  }
  const address = text("address", 1000), url = text("property_url", 2000), notes = text("notes", 4000);
  for (const [field, entry] of [["address", address], ["property_url", url], ["notes", notes]] as const) {
    if (entry === undefined) return { error: `Check the ${field.replaceAll("_", " ")} length.`, field };
  }
  if (url) {
    try { const parsed = new URL(url); if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error(); }
    catch { return { error: "Use a complete http or https property link.", field: "property_url" }; }
  }
  if (input.type != null && input.type !== "" && !["hotel", "rental", "hut", "campground", "other"].includes(String(input.type))) return { error: "Choose a stay type.", field: "type" };
  const time = (key: string) => input[key] == null || input[key] === "" ? null : typeof input[key] === "string" && /^([01]\d|2[0-3]):[0-5]\d(:00)?$/.test(input[key]) ? input[key].slice(0, 5) : undefined;
  const inTime = time("check_in_time"), outTime = time("check_out_time");
  if (inTime === undefined || outTime === undefined) return { error: "Choose valid local check-in and check-out times.", field: inTime === undefined ? "check_in_time" : "check_out_time" };
  if (input.booking_status !== undefined && !["not_booked", "booked"].includes(String(input.booking_status))) return { error: "Choose a booking status.", field: "booking_status" };
  // No location key keeps the saved one (see TripStayInput.location).
  let location: TripLocation | null | undefined = input.location === null ? null : undefined;
  if (input.location != null) {
    const parsed = parseTripLocation(input.location);
    if ("error" in parsed) return { error: parsed.error, field: "location" };
    location = parsed;
  }
  return { id: input.id, name, check_in: checkIn as string | null, check_out: checkOut as string | null,
    type: (input.type || null) as TripStayInput["type"], address: address ?? null, property_url: url ?? null,
    notes: notes ?? null, check_in_time: inTime, check_out_time: outTime,
    booking_status: (input.booking_status ?? "not_booked") as TripStayInput["booking_status"],
    ...(location === undefined ? {} : { location }) };
}

/** The member fields lodging uses; `created_at` orders people. */
export type LodgingMember = Pick<TripMember, "id" | "display_name" | "role" | "status"> & { created_at?: string };

/** Who and what a lodging plan is built from, besides the trip and its stays. */
interface LodgingCrew {
  members?: LodgingMember[];
  attendance?: TripMemberAttendance[];
  /** Whether the nights are saved per person; see TripLodging.per_member. */
  per_member?: boolean;
}

/**
 * The crew a crew-wide plan is for: joined accounts, the organizer included,
 * and managed guests. A pending invitation has its own nights only once
 * someone plans them, so nobody is assumed to stay anywhere before they've
 * said they're coming. Migration 20261021201500 uses the same rule.
 */
export const CREW_STATUSES: ReadonlySet<string> = new Set(["joined", "guest"]);

/** Matches trip_lodging_people_key (20261021201500): every member's id and membership, in id order. */
export function peopleKey(members: Pick<TripMember, "id" | "status">[]): string {
  const list = members.map((member) => `${member.id}:${member.status}`).sort();
  return createHash("md5").update(list.join(",")).digest("hex");
}

/** Where a person's nights on the trip start, and the first night they're not. */
export function attendanceWindow(trip: Pick<Trip, "start_date" | "end_date">, attendance: Pick<TripMemberAttendance, "arrival_date" | "departure_date"> | undefined) {
  return { first: attendance?.arrival_date ?? shiftDate(trip.start_date, -1), afterLast: attendance?.departure_date ?? shiftDate(trip.end_date, 1) };
}

const PERSON_LABELS: Record<Exclude<TripLodgingState, "assigned">, string> = { no_stay: "No accommodation needed", unplanned: "Not planned", not_on_trip: "Not on trip" };
const PARTICIPATION_LABELS = { participating: "Taking part", skipping: "Not taking part", not_on_trip: "Not on trip" } as const;
export const participationLabel = (participation: keyof typeof PARTICIPATION_LABELS) => PARTICIPATION_LABELS[participation];
const groupLabel = (groups: Array<[string, number]>) => groups.length === 1 ? groups[0][0] : groups.map(([label, count]) => `${label} (${count})`).join(" · ");

function attendanceLabel(attendance: TripMemberAttendance | undefined): string {
  const parts = [
    attendance?.arrival_date && `Arrives ${dateLabel(attendance.arrival_date)}`,
    attendance?.departure_date && `Leaves ${dateLabel(attendance.departure_date)}`,
    attendance?.skipped_dates.length && `Skips ${attendance.skipped_dates.map(dateLabel).join(", ")}`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Whole trip";
}

/** A person's nights as runs of the same plan; a gap and a planned-by-choice night don't share one. */
function personRuns(nights: TripPersonNight[], gaps: Set<string>): TripPersonRun[] {
  const runs: TripPersonRun[] = [];
  for (const night of nights) {
    const gap = gaps.has(night.date), last = runs.at(-1);
    if (last && last.end === night.date && last.state === night.state && last.stay_id === night.stay_id && last.gap === gap) {
      last.end = shiftDate(night.date, 1); last.nights += 1;
    } else {
      runs.push({ state: night.state, stay_id: night.stay_id, label: night.label, start: night.date, end: shiftDate(night.date, 1), nights: 1, date_label: "", gap });
    }
  }
  return runs.map((run) => ({ ...run, date_label: nightsLabel(run.start, run.nights) }));
}

/** Stays by the number of people in each, then in stay order. */
function majority(groups: TripLodgingGroup[]): TripLodgingGroup | undefined {
  return [...groups].sort((a, b) => b.member_ids.length - a.member_ids.length)[0];
}

/**
 * Every person's nights and days, and the crew's view of them, for the trip
 * as it is. All coverage, origin and overlap calculations stay on the server.
 * See docs/trip-stays.md.
 */
export function buildLodging(trip: Trip, stays: TripStay[], assignments: TripLodgingNight[], crew: LodgingCrew = {}): TripLodging {
  const byId = new Map(stays.map((stay) => [stay.id, stay]));
  const members = [...crew.members ?? []].sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? "") || String(a.id).localeCompare(String(b.id)));
  const attendance = crew.attendance ?? [];
  const preTrip = shiftDate(trip.start_date, -1);
  const nightDates = dates(preTrip, shiftDate(trip.end_date, 1));
  const dayDates = dates(trip.start_date, shiftDate(trip.end_date, 1));
  const crewRows = new Map(assignments.filter((night) => !night.member_id).map((night) => [night.date, night]));
  const personRows = new Map(assignments.filter((night) => night.member_id).map((night) => [`${night.member_id}|${night.date}`, night]));
  const stayName = (stayId: string | null) => (stayId && byId.get(stayId)?.name) || "Not planned yet";

  const people = members.map((member) => {
    const saved = attendance.find((entry) => entry.member_id === member.id);
    const { first, afterLast } = attendanceWindow(trip, saved);
    const current = member.status !== "left";
    const onTrip = (night: string) => current && night >= first && night < afterLast;
    const skipped = new Set(saved?.skipped_dates ?? []);
    // A person's own row, or the crew's from before per-person nights.
    const rowFor = (night: string) => personRows.get(`${member.id}|${night}`) ?? (CREW_STATUSES.has(member.status) ? crewRows.get(night) : undefined);
    const nightFor = (night: string): TripPersonNight => {
      const row = onTrip(night) ? rowFor(night) : undefined;
      const state: TripLodgingState = !onTrip(night) ? "not_on_trip" : row?.status ?? "unplanned";
      return { date: night, state, stay_id: row?.stay_id ?? null, label: state === "assigned" ? stayName(row!.stay_id) : PERSON_LABELS[state] };
    };
    const nights = nightDates.map(nightFor);
    const night = (date: string) => nights.find((entry) => entry.date === date) ?? nightFor(date);
    const days = dayDates.map((date): TripPersonDay => {
      const participation = !current || date < first || date > afterLast ? "not_on_trip" : skipped.has(date) ? "skipping" : "participating";
      const before = night(shiftDate(date, -1)), tonight = night(date);
      const startingFrom = participation === "skipping" ? "Not taking part" : participation === "not_on_trip" ? "Not on trip"
        : before.state === "assigned" ? before.label : before.state === "not_on_trip" ? "Arrives this day" : "Not set";
      return { date, participation, starting_stay_id: participation === "participating" ? before.stay_id : null, starting_from: startingFrom,
        tonight_stay_id: tonight.stay_id, staying_tonight: tonight.label };
    });
    const gaps = nights.filter((entry) => entry.state === "unplanned" && entry.date >= trip.start_date && entry.date < trip.end_date).map((entry) => entry.date);
    // Mornings they leave one stay and sleep in another that night.
    const changeovers = dayDates.flatMap((date): TripPersonChangeover[] => {
      const before = night(shiftDate(date, -1)), tonight = night(date);
      return before.state === "assigned" && tonight.state === "assigned" && before.stay_id !== tonight.stay_id
        ? [{ date, date_label: dateLabel(date), from: before.label, to: tonight.label }] : [];
    });
    const person: TripLodgingPerson = {
      member_id: member.id, display_name: member.display_name, role: member.role, membership: member.status,
      attendance: {
        arrival_date: saved?.arrival_date ?? null, departure_date: saved?.departure_date ?? null, skipped_dates: [...skipped].sort(),
        label: attendanceLabel(saved),
        review_dates: [...new Set([
          ...saved?.arrival_date && (saved.arrival_date < preTrip || saved.arrival_date > trip.end_date) ? [saved.arrival_date] : [],
          ...saved?.departure_date && (saved.departure_date < trip.start_date || saved.departure_date > shiftDate(trip.end_date, 1)) ? [saved.departure_date] : [],
          ...[...skipped].filter((date) => date < trip.start_date || date > trip.end_date),
        ])].sort(),
      },
      nights, days, gaps,
      review_nights: current ? assignments.filter((row) => row.member_id === member.id && !onTrip(row.date)).map((row) => row.date).sort() : [],
      runs: personRuns(nights, new Set(gaps)), changeovers,
    };
    // Counted in the crew's view of a night: the crew, and anyone else once they have a plan for it.
    const counted = (date: string) => onTrip(date) && (CREW_STATUSES.has(member.status) || personRows.has(`${member.id}|${date}`));
    return { person, counted, night };
  });

  const groupsFor = (entries: Array<{ id: string; stay_id: string | null }>): TripLodgingGroup[] => stays
    .map((stay) => ({ stay_id: stay.id, label: stay.name, member_ids: entries.filter((entry) => entry.stay_id === stay.id).map((entry) => entry.id) }))
    .filter((group) => group.member_ids.length > 0);
  const crewNight = (date: string): TripLodgingCrewNight => {
    const base = { date, date_label: dateLabel(date), pre_trip: date === preTrip, last_night: date === trip.end_date };
    const counted = people.filter((entry) => entry.counted(date)).map((entry) => ({ id: entry.person.member_id, ...entry.night(date) }));
    if (!counted.length) {
      // Nobody to count: a plan built from the crew-wide nights alone.
      const row = crewRows.get(date);
      const status = row?.status ?? "unplanned";
      return { ...base, label: status === "no_stay" ? "No stay needed" : stayName(row?.stay_id ?? null), stay_id: row?.stay_id ?? null, status,
        split: false, occupancy: row?.stay_id ? [{ stay_id: row.stay_id, label: stayName(row.stay_id), member_ids: [] }] : [], unplanned_member_ids: [] };
    }
    const occupancy = groupsFor(counted.filter((entry) => entry.state === "assigned"));
    const noStay = counted.filter((entry) => entry.state === "no_stay"), unplanned = counted.filter((entry) => entry.state === "unplanned");
    const groups: Array<[string, number]> = [...occupancy.map((group): [string, number] => [group.label, group.member_ids.length]),
      ...noStay.length ? [["No stay needed", noStay.length] as [string, number]] : [], ...unplanned.length ? [["Not planned yet", unplanned.length] as [string, number]] : []];
    return { ...base, label: groupLabel(groups), stay_id: majority(occupancy)?.stay_id ?? null,
      status: occupancy.length ? "assigned" : noStay.length ? "no_stay" : "unplanned", split: occupancy.length > 1, occupancy,
      unplanned_member_ids: unplanned.map((entry) => entry.id) };
  };
  const nights = nightDates.map(crewNight);
  const crewNightOn = (date: string) => nights.find((night) => night.date === date) ?? crewNight(date);

  const savedNightsAt = (stayId: string) => [...new Set(assignments.filter((row) => row.stay_id === stayId
    && (!row.member_id || members.some((member) => member.id === row.member_id && member.status !== "left"))).map((row) => row.date))].sort();
  return {
    revision: trip.lodging_revision ?? 0,
    people_key: peopleKey(members),
    per_member: crew.per_member ?? false,
    assignments,
    attendance,
    stays: stays.map((stay) => {
      const covered = dates(stay.check_in, stay.check_out);
      // Who sleeps here each night of the itinerary, consecutive nights with the same people together.
      const occupancy: TripLodging["stays"][number]["occupancy"] = [];
      for (const date of covered.filter((night) => night >= preTrip && night <= trip.end_date)) {
        const ids = people.filter((entry) => { const night = entry.night(date); return night.state === "assigned" && night.stay_id === stay.id; }).map((entry) => entry.person.member_id);
        const last = occupancy.at(-1);
        if (last && last.dates.at(-1) === shiftDate(date, -1) && last.member_ids.join() === ids.join()) last.dates.push(date);
        else occupancy.push({ dates: [date], date_label: "", member_ids: ids });
      }
      return { ...stay, night_count: covered.length, date_label: covered.length ? nightsLabel(stay.check_in!, covered.length) : "Dates not set",
        assigned_nights: savedNightsAt(stay.id),
        occupants: members.filter((member) => member.status !== "left").map((member) => ({ member_id: member.id,
          nights: assignments.filter((row) => row.member_id === member.id && row.stay_id === stay.id).map((row) => row.date).sort() }))
          .filter((occupant) => occupant.nights.length > 0),
        occupancy: occupancy.map((run) => ({ ...run, date_label: nightsLabel(run.dates[0], run.dates.length) })),
        checkout_label: stay.check_out ? `Check-out ${dateLabel(stay.check_out)} morning` : null,
        review_dates: covered.filter((date) => date < preTrip || date > trip.end_date) };
    }),
    nights,
    days: dayDates.map((date) => {
      const before = crewNightOn(shiftDate(date, -1)), tonight = crewNightOn(date);
      const participating = people.filter((entry) => entry.person.days.find((day) => day.date === date)?.participation === "participating");
      let origins: TripLodgingGroup[];
      if (people.length) {
        origins = groupsFor(participating.map((entry) => ({ id: entry.person.member_id, stay_id: entry.night(shiftDate(date, -1)).state === "assigned" ? entry.night(shiftDate(date, -1)).stay_id : null })));
      } else {
        origins = before.occupancy;
      }
      const main = majority(origins);
      return { date, starting_from: main ? groupLabel(origins.map((group) => [group.label, group.member_ids.length])) : "Not set", starting_stay_id: main?.stay_id ?? null,
        staying_tonight: tonight.label, tonight_stay_id: tonight.stay_id, origins, split: origins.length > 1,
        participating_member_ids: participating.map((entry) => entry.person.member_id) };
    }),
    people: people.map((entry) => entry.person),
  };
}

const MISSING_TABLE = ["42P01", "PGRST205"];
/** PostgREST's max_rows: a longer read is cut short without an error. */
const PAGE = 1000;

type Page<T> = { data: T[] | null; error: { code: string } | null };

/** Every row of a read that can pass max_rows, a page at a time; `page` must order rows fully. */
async function readAll<T>(page: (from: number, to: number) => PromiseLike<Page<T>>): Promise<Page<T>> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) return { data: null, error };
    rows.push(...data ?? []);
    if ((data?.length ?? 0) < PAGE) return { data: rows, error: null };
  }
}

/** A trip's saved lodging: per person once migration 20261021201500 is applied, the crew's before. */
export interface LodgingRows {
  stays: TripStay[];
  assignments: TripLodgingNight[];
  attendance: TripMemberAttendance[];
  per_member: boolean;
}

export async function loadLodgingRows(supabase: SupabaseClient, tripId: string): Promise<LodgingRows> {
  const [stays, nights, attendance] = await Promise.all([
    supabase.from("trip_stays").select("*").eq("trip_id", tripId).order("created_at"),
    // One row per person and night, so a long trip with a big crew passes max_rows.
    readAll<TripLodgingNight>((from, to) => supabase.from("trip_member_lodging_nights").select("*").eq("trip_id", tripId)
      .order("date").order("member_id").range(from, to)),
    supabase.from("trip_member_attendance").select("*").eq("trip_id", tripId),
  ]);
  if (stays.error) throw new Error("Couldn't load crew stays. Try again.");
  // Before the migration only the crew-wide nights exist. Any other failure might hide a plan.
  if (nights.error && MISSING_TABLE.includes(nights.error.code)) {
    const crew = await supabase.from("trip_lodging_nights").select("*").eq("trip_id", tripId).order("date");
    if (crew.error) throw new Error("Couldn't load crew stays. Try again.");
    return { stays: (stays.data ?? []) as TripStay[], assignments: (crew.data ?? []) as TripLodgingNight[], attendance: [], per_member: false };
  }
  if (nights.error || attendance.error) throw new Error("Couldn't load crew stays. Try again.");
  return {
    stays: (stays.data ?? []) as TripStay[], assignments: (nights.data ?? []) as TripLodgingNight[],
    attendance: ((attendance.data ?? []) as TripMemberAttendance[]).map((entry) => ({ ...entry, skipped_dates: [...entry.skipped_dates ?? []].sort() })),
    per_member: true,
  };
}

/** The members lodging is planned for; never invitation links. */
export async function loadLodgingMembers(supabase: SupabaseClient, tripId: string): Promise<LodgingMember[]> {
  const { data, error } = await supabase.from("trip_members").select("id, display_name, role, status, created_at").eq("trip_id", tripId).order("created_at");
  if (error) throw new Error("Couldn't load crew stays. Try again.");
  return (data ?? []) as LodgingMember[];
}

export async function loadLodging(supabase: SupabaseClient, trip: Trip): Promise<TripLodging> {
  const [rows, members] = await Promise.all([loadLodgingRows(supabase, trip.id), loadLodgingMembers(supabase, trip.id)]);
  return buildLodging(trip, rows.stays, rows.assignments, { members, attendance: rows.attendance, per_member: rows.per_member });
}

/**
 * Before per-person nights: what a change does to the crew-wide nights,
 * following mutate_trip_lodging as of migration 025.
 */
export function previewCrewLodging(trip: Trip, lodging: TripLodging, action: TripLodgingAction, payload: TripStayInput | { id: string } | { date: string; status: string }): TripLodgingPreview {
  const old = "id" in payload ? lodging.stays.find((stay) => stay.id === payload.id) : undefined;
  const stay = action === "save" ? payload as TripStayInput : undefined;
  const rangeChanged = stay && (!old || old.check_in !== stay.check_in || old.check_out !== stay.check_out);
  const assigning = rangeChanged ? dates(stay.check_in, stay.check_out) : [];
  const clearing = action === "remove" || rangeChanged ? old?.assigned_nights ?? [] : [];
  const affected = [...new Set([...assigning, ...clearing, ...("date" in payload ? [payload.date] : [])])].sort();
  const conflicts: string[] = [];
  const labelFor = (date: string) => lodging.assignments.find((night) => night.date === date)?.status === "no_stay" ? "No stay needed" : lodging.nights.find((night) => night.date === date)?.label ?? lodging.stays.find((saved) => saved.assigned_nights.includes(date))?.name ?? "Not planned yet";
  return { revision: lodging.revision, people_key: lodging.people_key, changes: [], day_changes: [], summary: [],
    date_label: stay?.check_in ? `${dateLabel(stay.check_in)} → ${dateLabel(stay.check_out!)} · ${dates(stay.check_in, stay.check_out).length} nights` : "Dates not set",
    nights: affected.map((date) => {
      const existing = lodging.assignments.find((night) => night.date === date);
      const before = labelFor(date);
      let after = "Not planned yet";
      if (assigning.includes(date)) {
        after = stay!.name;
        if (existing && existing.stay_id !== stay!.id) conflicts.push(date);
      }
      if ("date" in payload) {
        after = payload.status === "no_stay" ? "No stay needed" : "Not planned yet";
        if (existing?.stay_id) conflicts.push(date);
      }
      const morning = shiftDate(date, 1);
      return { date, date_label: dateLabel(date), before, after, morning_origin: assigning.includes(date) ? stay!.name : "Not set", morning: morning >= trip.start_date && morning <= trip.end_date ? dateLabel(morning) : null };
    }), review_dates: stay ? dates(stay.check_in, stay.check_out).filter((date) => date < shiftDate(trip.start_date, -1) || date > trip.end_date) : [],
    conflicts };
}
