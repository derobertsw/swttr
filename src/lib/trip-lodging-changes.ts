import "server-only";
import {
  attendanceWindow, buildLodging, CREW_STATUSES, dateLabel, dates, isCalendarDate, isUuid, participationLabel, shiftDate,
  type LodgingMember, type LodgingRows,
} from "@/lib/trip-lodging";
import type {
  Trip, TripAttendanceInput, TripLodgingAssignment, TripLodgingNight, TripLodgingPreview, TripMemberAttendance, TripStay, TripStayInput,
} from "@/types/trips";

/**
 * A lodging change with per-person nights (#331), as mutate_trip_lodging
 * (20261021201500) applies it. The rules are in docs/trip-stays.md.
 */
export type LodgingChange =
  | { action: "save"; stay: TripStayInput; existing: boolean; occupants?: string[] }
  | { action: "remove"; id: string }
  | { action: "night"; date: string; status: "no_stay" | "unplanned" }
  | { action: "assign"; assignments: TripLodgingAssignment[] }
  | { action: "attendance"; member_id: string; attendance: TripAttendanceInput };

export type LodgingFailure = { error: string; field?: string; status: 400 | 404 };

/** mutate_trip_lodging's payload for a change: the parsed change, never fields the client added. */
export function lodgingPayload(change: LodgingChange): Record<string, unknown> {
  switch (change.action) {
    case "save": return { ...change.stay, existing: change.existing, ...(change.occupants ? { occupants: change.occupants } : {}) };
    case "remove": return { id: change.id };
    case "night": return { date: change.date, status: change.status };
    case "assign": return { assignments: change.assignments };
    case "attendance": return { member_id: change.member_id, ...change.attendance };
  }
}

const MAX_PEOPLE = 200, MAX_DATES = 400, MAX_NIGHTS = 2000;
const invalid = (error: string, field?: string): LodgingFailure => ({ error, ...(field ? { field } : {}), status: 400 });

const uniqueIds = (value: unknown, field: string): string[] | LodgingFailure => {
  if (!Array.isArray(value) || value.length > MAX_PEOPLE || !value.every(isUuid)) return invalid("Choose people from this trip.", field);
  const ids = value.map((id) => id.toLowerCase());
  return new Set(ids).size === ids.length ? ids : invalid("Each person can be listed once.", field);
};
const uniqueDates = (value: unknown, field: string, max: number): string[] | LodgingFailure => {
  if (!Array.isArray(value) || value.length > max || !value.every(isCalendarDate)) return invalid("Choose valid dates.", field);
  return new Set(value).size === value.length ? [...value].sort() : invalid("Each date can be listed once.", field);
};

/** A stay's occupants: missing keeps who stays there, a list sets exactly who does. */
export function parseOccupants(value: unknown): string[] | undefined | LodgingFailure {
  return value === undefined ? undefined : uniqueIds(value, "occupants");
}

export function parseAssignments(value: unknown): TripLodgingAssignment[] | LodgingFailure {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_PEOPLE) return invalid("Choose who and which nights to plan.", "assignments");
  const result: TripLodgingAssignment[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") return invalid("Choose who and which nights to plan.", "assignments");
    const { member_id: memberId, status, stay_id: stayId, dates: nights } = entry as Record<string, unknown>;
    if (!isUuid(memberId)) return invalid("Choose people from this trip.", "assignments");
    if (status !== "assigned" && status !== "no_stay" && status !== "unplanned") return invalid("Choose a stay, No accommodation needed or Not planned.", "assignments");
    if (status === "assigned" ? !isUuid(stayId) : stayId != null) return invalid("Choose a stay only for assigned nights.", "assignments");
    if (nights === undefined && status !== "assigned") return invalid("Choose which nights.", "assignments");
    const parsed = nights === undefined ? undefined : uniqueDates(nights, "assignments", MAX_DATES);
    if (parsed && "error" in parsed) return parsed;
    if (parsed && parsed.length === 0) return invalid("Choose which nights.", "assignments");
    result.push({ member_id: memberId.toLowerCase(), status, ...(status === "assigned" ? { stay_id: (stayId as string).toLowerCase() } : {}), ...(parsed ? { dates: parsed } : {}) });
  }
  return result;
}

export function parseAttendance(value: unknown): TripAttendanceInput | LodgingFailure {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid("Choose when they arrive and leave.", "arrival_date");
  const input = value as Record<string, unknown>;
  const date = (key: string) => input[key] == null || input[key] === "" ? null : isCalendarDate(input[key]) ? input[key] : undefined;
  const arrival = date("arrival_date"), departure = date("departure_date");
  if (arrival === undefined) return invalid("Choose a valid arrival date, or clear it for the whole trip.", "arrival_date");
  if (departure === undefined) return invalid("Choose a valid departure date, or clear it for the whole trip.", "departure_date");
  const skipped = input.skipped_dates === undefined ? [] : uniqueDates(input.skipped_dates, "skipped_dates", 366);
  if ("error" in skipped) return skipped;
  return { arrival_date: arrival as string | null, departure_date: departure as string | null, skipped_dates: skipped };
}

/** The saved rows after a change, with the person/night pairs whose existing plan it replaces. */
interface AppliedLodgingChange {
  stays: TripStay[];
  assignments: TripLodgingNight[];
  attendance: TripMemberAttendance[];
  /** "member_id|date" keys. */
  conflicts: Set<string>;
}

type Cell = { member_id: string; date: string; status: "assigned" | "no_stay" | "unplanned"; stay_id: string | null };
const key = (memberId: string, date: string) => `${memberId}|${date}`;

/** What `change` does to a trip's saved per-person rows, or why it can't be saved. */
export function applyLodgingChange(trip: Trip, rows: LodgingRows, members: LodgingMember[], change: LodgingChange): AppliedLodgingChange | LodgingFailure {
  const current = members.filter((member) => member.status !== "left");
  const windowOf = (memberId: string) => attendanceWindow(trip, rows.attendance.find((entry) => entry.member_id === memberId));
  const onTrip = (memberId: string, night: string) => { const window = windowOf(memberId); return night >= window.first && night < window.afterLast; };
  let { stays, assignments, attendance } = rows;
  const cells: Cell[] = [];
  const conflicts = new Set<string>();
  const saved = (memberId: string, date: string) => assignments.find((row) => row.member_id === memberId && row.date === date);
  const personNotFound: LodgingFailure = { error: "Person not found in this trip.", status: 404 };
  const stayNotFound: LodgingFailure = { error: "Stay not found in this trip.", status: 404 };

  if (change.action === "save") {
    const { stay } = change;
    const old = stays.find((candidate) => candidate.id === stay.id);
    if (change.existing && !old) return stayNotFound;
    const explicit = change.occupants !== undefined;
    if (change.occupants?.some((id) => !current.some((member) => member.id === id))) return personNotFound;
    const occupants = new Set(change.occupants ?? assignments.filter((row) => row.stay_id === stay.id && row.member_id).map((row) => row.member_id!));
    const rangeChanged = !old || old.check_in !== stay.check_in || old.check_out !== stay.check_out;
    if (stay.check_in && (rangeChanged || explicit)) {
      for (const night of dates(stay.check_in, stay.check_out)) {
        // Without explicit occupants, nights it already covered keep their plans.
        if (!explicit && old?.check_in && night >= old.check_in && night < old.check_out!) continue;
        for (const member of current) {
          if (!onTrip(member.id, night)) continue;
          if (occupants.has(member.id) || (!explicit && occupants.size === 0 && CREW_STATUSES.has(member.status))) {
            cells.push({ member_id: member.id, date: night, status: "assigned", stay_id: stay.id });
          }
        }
      }
    }
    if (rangeChanged) assignments = assignments.filter((row) => !(row.stay_id === stay.id && (!stay.check_in || row.date < stay.check_in || row.date >= stay.check_out!)));
    if (explicit) assignments = assignments.filter((row) => !(row.stay_id === stay.id && !occupants.has(row.member_id!)));
    const record: TripStay = { trip_id: trip.id, created_at: old?.created_at ?? "", updated_at: old?.updated_at ?? "", ...stay,
      location: "location" in stay ? stay.location ?? null : old?.location ?? null };
    stays = old ? stays.map((candidate) => candidate.id === stay.id ? record : candidate) : [...stays, record];
  } else if (change.action === "remove") {
    if (!stays.some((stay) => stay.id === change.id)) return stayNotFound;
    stays = stays.filter((stay) => stay.id !== change.id);
    assignments = assignments.filter((row) => row.stay_id !== change.id);
  } else if (change.action === "night") {
    // The crew on the trip that night, and anyone already planned for it.
    for (const member of current) {
      if (onTrip(member.id, change.date) && (CREW_STATUSES.has(member.status) || saved(member.id, change.date))) {
        cells.push({ member_id: member.id, date: change.date, status: change.status, stay_id: null });
      }
    }
  } else if (change.action === "assign") {
    for (const entry of change.assignments) {
      const member = current.find((candidate) => candidate.id === entry.member_id);
      if (!member) return personNotFound;
      const target = entry.status === "assigned" ? stays.find((stay) => stay.id === entry.stay_id) : undefined;
      if (entry.status === "assigned" && !target) return stayNotFound;
      if (target && !target.check_in) return invalid(`Add dates to ${target.name} before planning nights there.`, "assignments");
      const nights = entry.dates ?? dates(target!.check_in, target!.check_out).filter((night) => onTrip(member.id, night));
      for (const night of nights) {
        if (!onTrip(member.id, night)) return invalid(`${member.display_name} isn't on the trip the night of ${dateLabel(night)}. Change their dates first.`, "assignments");
        if (target && (night < target.check_in! || night >= target.check_out!)) return invalid(`${target.name} doesn't include the night of ${dateLabel(night)}. Change its dates first.`, "assignments");
        if (cells.some((cell) => cell.member_id === member.id && cell.date === night)) return invalid(`${member.display_name}'s night of ${dateLabel(night)} is listed twice.`, "assignments");
        cells.push({ member_id: member.id, date: night, status: entry.status, stay_id: target?.id ?? null });
      }
    }
    if (cells.length > MAX_NIGHTS) return invalid("Plan fewer nights at once.", "assignments");
  } else {
    const member = current.find((candidate) => candidate.id === change.member_id);
    if (!member) return personNotFound;
    const { arrival_date: arrival, departure_date: departure } = change.attendance;
    if (arrival && (arrival < shiftDate(trip.start_date, -1) || arrival > trip.end_date)) return invalid("Choose an arrival from the pre-trip night through the last night.", "arrival_date");
    if (departure && (departure < trip.start_date || departure > shiftDate(trip.end_date, 1))) return invalid("Choose a departure from the first day through the morning after the last night.", "departure_date");
    const next = attendanceWindow(trip, change.attendance);
    if (next.first > next.afterLast) return invalid("Choose a departure on or after the arrival.", "departure_date");
    const absent = change.attendance.skipped_dates.find((date) => date < trip.start_date || date > trip.end_date || date < next.first || date > next.afterLast);
    if (absent) return invalid(`${member.display_name} isn't there on ${dateLabel(absent)} to skip it.`, "skipped_dates");
    // Nights they had on the trip that the new dates don't include.
    for (const row of assignments) {
      if (row.member_id === member.id && onTrip(member.id, row.date) && (row.date < next.first || row.date >= next.afterLast)) {
        cells.push({ member_id: member.id, date: row.date, status: "unplanned", stay_id: null });
        conflicts.add(key(member.id, row.date));
      }
    }
    const whole = !arrival && !departure && !change.attendance.skipped_dates.length;
    attendance = [...attendance.filter((entry) => entry.member_id !== member.id),
      ...whole ? [] : [{ trip_id: trip.id, member_id: member.id, ...change.attendance }]];
  }

  // A night someone already has another plan for. Clearing one replaces nothing.
  if (change.action !== "attendance") {
    for (const cell of cells) {
      const row = saved(cell.member_id, cell.date);
      if (row && ((cell.status === "assigned" && row.stay_id !== cell.stay_id) || (cell.status === "no_stay" && row.status === "assigned"))) conflicts.add(key(cell.member_id, cell.date));
    }
  }
  const touched = new Set(cells.map((cell) => key(cell.member_id, cell.date)));
  assignments = [...assignments.filter((row) => !row.member_id || !touched.has(key(row.member_id, row.date))),
    ...cells.filter((cell) => cell.status !== "unplanned").map((cell): TripLodgingNight => ({ trip_id: trip.id, member_id: cell.member_id, date: cell.date,
      stay_id: cell.stay_id, status: cell.status as "assigned" | "no_stay" }))];
  return { stays, assignments, attendance, conflicts };
}

/**
 * What a change does to each person's nights and the following mornings,
 * with the conflicts a save must confirm. No write occurs.
 * `kits` are the saved kits of the person whose attendance changes.
 */
export function previewLodgingChange(trip: Trip, rows: LodgingRows, members: LodgingMember[], change: LodgingChange,
  kits: Array<{ member_id: string; date: string }> = []): TripLodgingPreview | LodgingFailure {
  const applied = applyLodgingChange(trip, rows, members, change);
  if ("error" in applied) return applied;
  const before = buildLodging(trip, rows.stays, rows.assignments, { members, attendance: rows.attendance, per_member: true });
  const after = buildLodging(trip, applied.stays, applied.assignments, { members, attendance: applied.attendance, per_member: true });
  const morningOf = (date: string) => { const morning = shiftDate(date, 1); return morning >= trip.start_date && morning <= trip.end_date ? morning : null; };
  const changes = after.people.flatMap((person, index) => person.nights.flatMap((night, nightIndex) => {
    const prior = before.people[index].nights[nightIndex];
    if (prior.state === night.state && prior.stay_id === night.stay_id) return [];
    const morning = morningOf(night.date);
    return [{ member_id: person.member_id, display_name: person.display_name, membership: person.membership, date: night.date, date_label: dateLabel(night.date),
      before: prior.label, after: night.label, morning: morning && dateLabel(morning),
      morning_origin: morning ? person.days.find((day) => day.date === morning)!.starting_from : null,
      conflict: applied.conflicts.has(key(person.member_id, night.date)) }];
  }));
  const changed = new Set(changes.map((entry) => entry.date));
  const stay = change.action === "save" ? change.stay : undefined;
  return {
    revision: before.revision,
    people_key: before.people_key,
    nights: after.nights.flatMap((night, index) => {
      if (!changed.has(night.date) && night.label === before.nights[index].label) return [];
      const morning = morningOf(night.date);
      return [{ date: night.date, date_label: night.date_label, before: before.nights[index].label, after: night.label,
        morning: morning && dateLabel(morning), morning_origin: morning ? after.days.find((day) => day.date === morning)!.starting_from : "Not set" }];
    }),
    conflicts: [...new Set(changes.filter((entry) => entry.conflict).map((entry) => entry.date))].sort(),
    changes,
    day_changes: change.action !== "attendance" ? [] : after.people.flatMap((person, index) => person.member_id !== change.member_id ? [] : person.days.flatMap((day, dayIndex) => {
      const prior = before.people[index].days[dayIndex];
      return prior.participation === day.participation ? [] : [{ member_id: person.member_id, display_name: person.display_name, date: day.date, date_label: dateLabel(day.date),
        before: participationLabel(prior.participation), after: participationLabel(day.participation),
        kit_saved: kits.some((kit) => kit.member_id === person.member_id && kit.date === day.date) }];
    })),
    review_dates: stay ? dates(stay.check_in, stay.check_out).filter((date) => date < shiftDate(trip.start_date, -1) || date > trip.end_date) : [],
    date_label: stay ? after.stays.find((saved) => saved.id === stay.id)!.date_label
      : change.action === "attendance" ? after.people.find((person) => person.member_id === change.member_id)!.attendance.label : "",
  };
}
