import { describe, expect, it } from "vitest";
import { buildLodging, parseStay, peopleKey, previewCrewLodging } from "@/lib/trip-lodging";
import { TRIP } from "@/test/tripApi";
import { ALEX, BLAIR, CASEY, DANA, ELI, FRAN, FRI, LODGE, MON, PINE, SAT, SPLIT_MEMBERS, SPLIT_TRIP, SUN, THU, VILLAGE, splitRows } from "@/test/splitStays";
import type { TripStay, TripLodgingNight } from "@/types/trips";

export const STAY: TripStay = { id: "40f9f55e-0e74-4c4a-923f-d7a3f92468a0", trip_id: TRIP.id, name: "Hotel", check_in: "2026-10-09", check_out: "2026-10-11", type: null, address: null, property_url: null, check_in_time: null, check_out_time: null, notes: null, booking_status: "not_booked", created_at: TRIP.created_at, updated_at: TRIP.updated_at };
const hut: TripStay = { ...STAY, id: "a682b8af-d26b-4213-a816-39de3eb155eb", name: "Hut", check_in: "2026-10-11", check_out: "2026-10-13" };
const assigned = (stay: TripStay, date: string): TripLodgingNight => ({ trip_id: TRIP.id, date, stay_id: stay.id, status: "assigned" });

// Saturday–Monday itinerary; Friday night explicitly supplies its first origin.
describe("Lodging dates and previews", () => {
  it("keeps Friday–Sunday as two nights and includes checkout morning's origin", () => {
    const lodging = buildLodging(TRIP, [STAY], [assigned(STAY, "2026-10-09"), assigned(STAY, "2026-10-10")]);
    expect(lodging.stays[0].date_label).toBe("Fri Oct 9 → Sun Oct 11 · 2 nights");
    expect(lodging.days[0]).toMatchObject({ starting_from: "Hotel", staying_tonight: "Hotel" });
    expect(lodging.days[1]).toMatchObject({ starting_from: "Hotel", staying_tonight: "Not planned yet" });
  });
  it("distinguishes the morning base from tonight's hotel change", () => {
    const lodging = buildLodging(TRIP, [STAY, hut], [assigned(STAY, "2026-10-10"), assigned(hut, "2026-10-11")]);
    expect(lodging.days[1]).toMatchObject({ starting_from: "Hotel", staying_tonight: "Hut" });
  });
  it("doesn't infer a first-day origin or one from undated/no-stay nights", () => {
    const lodging = buildLodging(TRIP, [{ ...STAY, check_in: null, check_out: null }], [{ trip_id: TRIP.id, date: "2026-10-10", stay_id: null, status: "no_stay" }]);
    expect(lodging.stays[0].date_label).toBe("Dates not set");
    expect(lodging.days[0]).toMatchObject({ starting_from: "Not set", staying_tonight: "No stay needed" });
    expect(lodging.days[1].starting_from).toBe("Not set");
  });
  it("previews exact overlapping nights and morning origins", () => {
    const lodging = buildLodging(TRIP, [STAY], [assigned(STAY, "2026-10-09"), assigned(STAY, "2026-10-10")]);
    const preview = previewCrewLodging(TRIP, lodging, "save", { ...hut, check_in: "2026-10-10" });
    expect(preview.conflicts).toEqual(["2026-10-10"]);
    expect(preview.nights[0]).toMatchObject({ before: "Hotel", after: "Hut", morning: "Sun Oct 11" });
    expect(preview.nights.map((night) => night.date)).toEqual(["2026-10-10", "2026-10-11", "2026-10-12"]);
  });
  it("previews removal and date changes without mutating the saved plan", () => {
    const lodging = buildLodging(TRIP, [STAY], [assigned(STAY, "2026-10-09"), assigned(STAY, "2026-10-10")]);
    expect(previewCrewLodging(TRIP, lodging, "remove", { id: STAY.id }).nights[0]).toMatchObject({ before: "Hotel", after: "Not planned yet", morning: "Sat Oct 10" });
    expect(previewCrewLodging(TRIP, lodging, "save", { ...STAY, check_in: null, check_out: null }).nights).toHaveLength(2);
    expect(lodging.stays[0].assigned_nights).toHaveLength(2);
    expect(previewCrewLodging(TRIP, lodging, "save", { ...STAY, notes: "Meet in lobby" }).nights).toHaveLength(0);
  });
  it("flags dates outside a shortened itinerary while allowing the pre-trip night", () => {
    expect(buildLodging(TRIP, [STAY], []).stays[0].review_dates).toEqual([]);
    const shortened = { ...TRIP, start_date: "2026-10-11", end_date: "2026-10-11" };
    expect(buildLodging(shortened, [STAY, hut], []).stays.map((stay) => stay.review_dates)).toEqual([["2026-10-09"], ["2026-10-12"]]);
  });
  it("accepts unresolved addresses and only safe property URLs", () => {
    expect(parseStay({ ...STAY, address: "An unmapped hut", property_url: "https://example.com/hut" })).toMatchObject({ address: "An unmapped hut" });
    expect(parseStay({ id: STAY.id, name: " Draft " })).toMatchObject({ name: "Draft", check_in: null, check_out: null, booking_status: "not_booked" });
    for (const property_url of ["javascript:alert(1)", "data:text/html,test", "file:///etc/passwd", "https://name:password@example.com"]) expect(parseStay({ ...STAY, property_url })).toMatchObject({ field: "property_url" });
  });
  it.each([{ check_in: "2026-02-30" }, { check_out: null }, { check_out: "2026-10-09" }, { check_out: "9999-12-31" }, { check_in: 0 }, { name: " " }, { notes: "x".repeat(4001) }, { check_in_time: "25:10" }, { type: "castle" }])("rejects invalid or unbounded stay data (%#)", (change) => {
    expect(parseStay({ ...STAY, ...change })).toHaveProperty("error");
  });
});

describe("Per-person nights and the crew's view of them (#331)", () => {
  const build = (rows = splitRows(), members = SPLIT_MEMBERS) =>
    buildLodging(SPLIT_TRIP, rows.stays, rows.assignments, { members, attendance: rows.attendance, per_member: true });
  const person = (lodging: ReturnType<typeof build>, id: string) => lodging.people.find((entry) => entry.member_id === id)!;

  it("gives an evening arrival Saturday's lodging without Saturday's plan or Friday's night", () => {
    const casey = person(build(), CASEY.id);
    expect(casey.nights.map((night) => [night.date, night.state, night.label])).toEqual([
      [THU, "not_on_trip", "Not on trip"], [FRI, "not_on_trip", "Not on trip"], [SAT, "assigned", "Pine rental"],
      [SUN, "assigned", "Mountain lodge"], [MON, "assigned", "Mountain lodge"]]);
    expect(casey.days.map((day) => [day.date, day.participation, day.starting_from, day.staying_tonight])).toEqual([
      [FRI, "not_on_trip", "Not on trip", "Not on trip"], [SAT, "skipping", "Not taking part", "Pine rental"],
      [SUN, "participating", "Pine rental", "Mountain lodge"], [MON, "participating", "Mountain lodge", "Mountain lodge"]]);
    expect(casey.attendance).toMatchObject({ arrival_date: SAT, label: "Arrives Sat Oct 10 · Skips Sat Oct 10", review_dates: [] });
    expect(casey.gaps).toEqual([]);
  });

  it("names each group on a split night and starts the crew's day from where most of them slept", () => {
    const lodging = build();
    expect(lodging.nights.map((night) => [night.date, night.label, night.stay_id, night.split])).toEqual([
      [THU, "Not planned yet", null, false],
      [FRI, "Pine rental (3) · Village hotel (2)", PINE.id, true],
      [SAT, "Pine rental (4) · Village hotel (2)", PINE.id, true],
      [SUN, "Mountain lodge", LODGE.id, false],
      [MON, "Mountain lodge", LODGE.id, false]]);
    expect(lodging.nights[1].occupancy).toEqual([{ stay_id: PINE.id, label: "Pine rental", member_ids: [ALEX.id, BLAIR.id, DANA.id] },
      { stay_id: VILLAGE.id, label: "Village hotel", member_ids: [ELI.id, FRAN.id] }]);
    expect(lodging.nights.map((night) => [night.pre_trip, night.last_night])).toEqual([[true, false], [false, false], [false, false], [false, false], [false, true]]);
    // Casey isn't there Friday and skips Saturday, so he's no one's origin until Sunday.
    expect(lodging.days.map((day) => [day.date, day.starting_from, day.starting_stay_id, day.participating_member_ids.length])).toEqual([
      [FRI, "Not set", null, 5], [SAT, "Pine rental (3) · Village hotel (2)", PINE.id, 5],
      [SUN, "Pine rental (4) · Village hotel (2)", PINE.id, 6], [MON, "Mountain lodge", LODGE.id, 6]]);
    expect(lodging.days[2].origins.map((group) => group.member_ids.length)).toEqual([4, 2]);
    expect(lodging.stays.find((stay) => stay.id === PINE.id)).toMatchObject({ assigned_nights: [FRI, SAT],
      occupants: [{ member_id: ALEX.id, nights: [FRI, SAT] }, { member_id: BLAIR.id, nights: [FRI, SAT] }, { member_id: CASEY.id, nights: [SAT] }, { member_id: DANA.id, nights: [FRI, SAT] }] });
  });

  it("keeps a pending invitation and a managed guest as they are, and leaves the pre-trip and last nights out of gaps", () => {
    const rows = splitRows();
    rows.assignments = rows.assignments.filter((night) => night.member_id !== FRAN.id && !(night.member_id === DANA.id && night.date === SAT));
    const lodging = build(rows);
    expect(person(lodging, FRAN.id)).toMatchObject({ membership: "invited", gaps: [FRI, SAT, SUN] });
    expect(person(lodging, DANA.id)).toMatchObject({ membership: "guest", role: "guest", gaps: [SAT] });
    expect(person(lodging, ALEX.id).gaps).toEqual([]);
    // Fran has no plan, so she isn't counted in the crew's nights; Dana is.
    expect(lodging.nights[2]).toMatchObject({ label: "Pine rental (3) · Village hotel (1) · Not planned yet (1)", unplanned_member_ids: [DANA.id] });
    expect(lodging.nights[1].label).toBe("Pine rental (3) · Village hotel (1)");
  });

  it("ends an early departure's nights on the day they leave, which they still spend there", () => {
    const rows = splitRows();
    rows.attendance = [...rows.attendance, { trip_id: SPLIT_TRIP.id, member_id: DANA.id, arrival_date: null, departure_date: SUN, skipped_dates: [] }];
    rows.assignments = rows.assignments.filter((night) => !(night.member_id === DANA.id && night.date >= SUN));
    const dana = person(build(rows), DANA.id);
    expect(dana.nights.slice(3).map((night) => night.state)).toEqual(["not_on_trip", "not_on_trip"]);
    expect(dana.days.map((day) => day.participation)).toEqual(["participating", "participating", "participating", "not_on_trip"]);
    expect(dana.days[2]).toMatchObject({ starting_from: "Pine rental", staying_tonight: "Not on trip" });
    expect(dana.attendance.label).toBe("Leaves Sun Oct 11");
  });

  it("flags saved nights and dates the trip no longer includes, and ignores people who left", () => {
    const shortened = { ...SPLIT_TRIP, start_date: SAT };
    const rows = splitRows();
    const lodging = buildLodging(shortened, rows.stays, rows.assignments,
      { members: SPLIT_MEMBERS.map((entry) => entry.id === ELI.id ? { ...entry, status: "left" as const } : entry), attendance: rows.attendance, per_member: true });
    expect(person(lodging, ALEX.id).review_nights).toEqual([]);
    expect(person(lodging, ALEX.id).nights[0]).toMatchObject({ date: FRI, state: "assigned", label: "Pine rental" });
    expect(person(lodging, ELI.id).nights.every((night) => night.state === "not_on_trip")).toBe(true);
    expect(person(lodging, ELI.id).review_nights).toEqual([]);
    expect(lodging.nights[0]).toMatchObject({ date: FRI, pre_trip: true, label: "Pine rental (3) · Village hotel (1)" });
    expect(lodging.stays.find((stay) => stay.id === VILLAGE.id)!.occupants.map((entry) => entry.member_id)).toEqual([FRAN.id]);
    const moved = { ...SPLIT_TRIP, start_date: "2026-10-16", end_date: "2026-10-18" };
    const later = buildLodging(moved, rows.stays, rows.assignments, { members: SPLIT_MEMBERS, attendance: rows.attendance, per_member: true });
    expect(person(later, ALEX.id).review_nights).toEqual([FRI, SAT, SUN, MON]);
    expect(person(later, CASEY.id).attendance.review_dates).toEqual([SAT]);
  });

  it("applies crew-wide nights from before per-person nights to the crew only", () => {
    const lodging = buildLodging(SPLIT_TRIP, [PINE], [assigned(PINE, FRI)], { members: SPLIT_MEMBERS });
    expect(lodging.per_member).toBe(false);
    expect(lodging.nights[1]).toMatchObject({ label: "Pine rental", stay_id: PINE.id, split: false });
    expect(person(lodging, FRAN.id).nights[1].state).toBe("unplanned");
    expect(person(lodging, DANA.id).nights[1].state).toBe("assigned");
  });

  it("makes the same crew key as the database", () => {
    expect(peopleKey([])).toBe("d41d8cd98f00b204e9800998ecf8427e");
    expect(peopleKey([{ id: "b", status: "joined" }, { id: "a", status: "invited" }])).toBe(peopleKey([{ id: "a", status: "invited" }, { id: "b", status: "joined" }]));
    expect(peopleKey([{ id: "a", status: "joined" }])).not.toBe(peopleKey([{ id: "a", status: "invited" }]));
  });
});
