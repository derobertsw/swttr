import { describe, expect, it } from "vitest";
import { applyLodgingChange, parseAssignments, parseAttendance, parseOccupants, previewLodgingChange, type LodgingChange } from "@/lib/trip-lodging-changes";
import { ALEX, BLAIR, CASEY, DANA, ELI, FRAN, FRI, LODGE, MON, PINE, SAT, SPLIT_MEMBERS, SPLIT_TRIP, SUN, THU, VILLAGE, personNight, splitRows } from "@/test/splitStays";
import type { TripLodgingAssignment, TripLodgingPreview, TripStayInput } from "@/types/trips";

const preview = (change: LodgingChange, rows = splitRows(), kits: Array<{ member_id: string; date: string }> = []) => {
  const result = previewLodgingChange(SPLIT_TRIP, rows, SPLIT_MEMBERS, change, kits);
  if ("error" in result) throw new Error(result.error);
  return result;
};
const pairs = (result: TripLodgingPreview) => result.changes.map((entry) => `${entry.display_name} ${entry.date}: ${entry.before} → ${entry.after}${entry.conflict ? " (replaces)" : ""}`);
const input = (stay: typeof PINE, extra: Partial<TripStayInput> = {}): TripStayInput => ({ id: stay.id, name: stay.name, check_in: stay.check_in, check_out: stay.check_out,
  type: stay.type, address: null, property_url: null, check_in_time: null, check_out_time: null, notes: null, booking_status: stay.booking_status, ...extra });

describe("Per-person lodging changes (#331)", () => {
  it("moves two people for one night and names only their nights and next mornings", () => {
    const result = preview({ action: "assign", assignments: [
      { member_id: BLAIR.id, status: "assigned", stay_id: VILLAGE.id, dates: [SAT] },
      { member_id: DANA.id, status: "assigned", stay_id: VILLAGE.id, dates: [SAT] }] });
    expect(pairs(result)).toEqual([`Blair ${SAT}: Pine rental → Village hotel (replaces)`, `Dana ${SAT}: Pine rental → Village hotel (replaces)`]);
    expect(result.changes[0]).toMatchObject({ membership: "joined", morning: "Sun Oct 11", morning_origin: "Village hotel" });
    expect(result.conflicts).toEqual([SAT]);
    expect(result.nights).toEqual([{ date: SAT, date_label: "Sat Oct 10", before: "Pine rental (4) · Village hotel (2)", after: "Pine rental (2) · Village hotel (4)",
      morning: "Sun Oct 11", morning_origin: "Pine rental (2) · Village hotel (4)" }]);
  });

  it("lets a second property overlap the first for different people", () => {
    const rows = splitRows();
    rows.assignments = rows.assignments.filter((night) => night.stay_id !== VILLAGE.id);
    rows.stays = rows.stays.filter((stay) => stay.id !== VILLAGE.id);
    const result = preview({ action: "save", stay: input(VILLAGE), existing: false, occupants: [ELI.id, FRAN.id] }, rows);
    expect(result.conflicts).toEqual([]);
    expect(pairs(result)).toEqual([`Eli ${FRI}: Not planned → Village hotel`, `Eli ${SAT}: Not planned → Village hotel`,
      `Fran ${FRI}: Not planned → Village hotel`, `Fran ${SAT}: Not planned → Village hotel`]);
    expect(result.date_label).toBe("Fri Oct 9 → Sun Oct 11 · 2 nights");
  });

  it("previews an evening arrival: the nights before become Not on trip, and a saved kit is kept", () => {
    const rows = splitRows({ attendance: [] });
    const result = preview({ action: "attendance", member_id: CASEY.id, attendance: { arrival_date: SAT, departure_date: null, skipped_dates: [SAT] } }, rows,
      [{ member_id: CASEY.id, date: FRI }]);
    expect(pairs(result)).toEqual([`Casey ${THU}: Not planned → Not on trip`, `Casey ${FRI}: Not planned → Not on trip`]);
    expect(result.day_changes).toEqual([
      { member_id: CASEY.id, display_name: "Casey", date: FRI, date_label: "Fri Oct 9", before: "Taking part", after: "Not on trip", kit_saved: true },
      { member_id: CASEY.id, display_name: "Casey", date: SAT, date_label: "Sat Oct 10", before: "Taking part", after: "Not taking part", kit_saved: false }]);
    expect(result.date_label).toBe("Arrives Sat Oct 10 · Skips Sat Oct 10");
    expect(result.conflicts).toEqual([]);
  });

  it("asks to confirm the nights an early departure clears, and their next morning", () => {
    const result = preview({ action: "attendance", member_id: DANA.id, attendance: { arrival_date: null, departure_date: SUN, skipped_dates: [] } });
    expect(pairs(result)).toEqual([`Dana ${SUN}: Mountain lodge → Not on trip (replaces)`, `Dana ${MON}: Mountain lodge → Not on trip (replaces)`]);
    expect(result.changes[0]).toMatchObject({ morning: "Mon Oct 12", morning_origin: "Not on trip" });
    expect(result.conflicts).toEqual([SUN, MON]);
  });

  it("gives new nights of a stay to its occupants and asks before taking anyone from another stay", () => {
    const result = preview({ action: "save", stay: input(PINE, { check_out: "2026-10-12" }), existing: true });
    expect(pairs(result)).toEqual(["Alex", "Blair", "Casey", "Dana"].map((name) => `${name} ${SUN}: Mountain lodge → Pine rental (replaces)`));
    expect(result.changes[0]).toMatchObject({ morning: "Mon Oct 12", morning_origin: "Pine rental" });
  });

  it("keeps everyone's nights through a note-only edit, and frees only a removed stay's", () => {
    expect(preview({ action: "save", stay: input(PINE, { notes: "Hot tub code 4321" }), existing: true }).changes).toEqual([]);
    const removal = preview({ action: "remove", id: VILLAGE.id });
    expect(pairs(removal)).toEqual([`Eli ${FRI}: Village hotel → Not planned`, `Eli ${SAT}: Village hotel → Not planned`,
      `Fran ${FRI}: Village hotel → Not planned`, `Fran ${SAT}: Village hotel → Not planned`]);
    expect(removal.changes[0]).toMatchObject({ morning: "Sat Oct 10", morning_origin: "Not set", conflict: false });
  });

  it("plans a crew night for the people on the trip then, and counts an invitation once it has a plan", () => {
    const result = preview({ action: "night", date: SAT, status: "no_stay" });
    expect(result.changes.map((entry) => entry.display_name)).toEqual(["Alex", "Blair", "Casey", "Dana", "Eli", "Fran"]);
    expect(result.changes.every((entry) => entry.conflict)).toBe(true);
    const friday = preview({ action: "night", date: THU, status: "no_stay" });
    // Casey isn't there Thursday, and Fran has no plan for it.
    expect(friday.changes.map((entry) => entry.display_name)).toEqual(["Alex", "Blair", "Dana", "Eli"]);
    expect(friday.conflicts).toEqual([]);
  });

  it.each([
    ["a night they aren't there", { member_id: CASEY.id, status: "assigned", stay_id: PINE.id, dates: [FRI] },
      { error: "Casey isn't on the trip the night of Fri Oct 9. Change their dates first.", field: "assignments", status: 400 }],
    ["a night outside the stay", { member_id: ALEX.id, status: "assigned", stay_id: PINE.id, dates: [SUN] },
      { error: "Pine rental doesn't include the night of Sun Oct 11. Change its dates first.", field: "assignments", status: 400 }],
    ["someone not on this trip", { member_id: "m-other", status: "no_stay", dates: [FRI] }, { error: "Person not found in this trip.", status: 404 }],
    ["another trip's stay", { member_id: ALEX.id, status: "assigned", stay_id: "stay-other" }, { error: "Stay not found in this trip.", status: 404 }],
  ] satisfies Array<[string, TripLodgingAssignment, object]>)("refuses %s", (_, assignment, expected) => {
    expect(applyLodgingChange(SPLIT_TRIP, splitRows(), SPLIT_MEMBERS, { action: "assign", assignments: [assignment] })).toEqual(expected);
  });

  it("refuses a stay without dates, a night listed twice, and people who left", () => {
    const rows = splitRows();
    rows.stays = [...rows.stays, { ...PINE, id: "stay-draft", name: "Draft", check_in: null, check_out: null }];
    const assign = (...assignments: TripLodgingAssignment[]) =>
      applyLodgingChange(SPLIT_TRIP, rows, SPLIT_MEMBERS.map((entry) => entry.id === ELI.id ? { ...entry, status: "left" as const } : entry), { action: "assign", assignments });
    expect(assign({ member_id: ALEX.id, status: "assigned", stay_id: "stay-draft" })).toMatchObject({ error: "Add dates to Draft before planning nights there.", status: 400 });
    expect(assign({ member_id: ALEX.id, status: "no_stay", dates: [FRI] }, { member_id: ALEX.id, status: "unplanned", dates: [FRI] })).toMatchObject({ error: "Alex's night of Fri Oct 9 is listed twice.", status: 400 });
    expect(assign({ member_id: ELI.id, status: "unplanned", dates: [FRI] })).toMatchObject({ status: 404 });
  });

  it.each([
    [{ arrival_date: SUN, departure_date: SAT }, "departure_date"],
    [{ arrival_date: "2026-10-07" }, "arrival_date"],
    [{ departure_date: "2026-10-14" }, "departure_date"],
    [{ arrival_date: SAT, skipped_dates: [FRI] }, "skipped_dates"],
    [{ skipped_dates: [THU] }, "skipped_dates"],
  ])("refuses attendance %o", (attendance, field) => {
    const change: LodgingChange = { action: "attendance", member_id: CASEY.id, attendance: { arrival_date: null, departure_date: null, skipped_dates: [], ...attendance } };
    expect(applyLodgingChange(SPLIT_TRIP, splitRows(), SPLIT_MEMBERS, change)).toMatchObject({ field, status: 400 });
  });

  it("returns to the whole trip without a saved row or asserting any stay", () => {
    const result = applyLodgingChange(SPLIT_TRIP, splitRows(), SPLIT_MEMBERS, { action: "attendance", member_id: CASEY.id, attendance: { arrival_date: null, departure_date: null, skipped_dates: [] } });
    if ("error" in result) throw new Error(result.error);
    expect(result.attendance).toEqual([]);
    expect(result.assignments.filter((night) => night.member_id === CASEY.id).map((night) => night.date)).toEqual([SAT, SUN, MON]);
  });

  it("sets exactly who stays somewhere with explicit occupants", () => {
    const result = applyLodgingChange(SPLIT_TRIP, splitRows(), SPLIT_MEMBERS, { action: "save", stay: input(LODGE), existing: true, occupants: [ALEX.id, BLAIR.id] });
    if ("error" in result) throw new Error(result.error);
    expect(result.assignments.filter((night) => night.stay_id === LODGE.id).map((night) => `${night.member_id} ${night.date}`).sort())
      .toEqual([`${ALEX.id} ${SUN}`, `${ALEX.id} ${MON}`, `${BLAIR.id} ${SUN}`, `${BLAIR.id} ${MON}`]);
    expect(result.conflicts.size).toBe(0);
    expect(result.assignments).toContainEqual(personNight(FRAN.id, SAT, VILLAGE));
  });
});

describe("Parsing per-person lodging input", () => {
  it("normalizes assignments and rejects ambiguous ones", () => {
    const id = "1A000000-0000-4000-8000-000000000001", stay = "40F9F55E-0E74-4C4A-923F-D7A3F92468A0";
    expect(parseAssignments([{ member_id: id, status: "assigned", stay_id: stay }, { member_id: id, status: "no_stay", dates: [SAT, FRI] }])).toEqual([
      { member_id: id.toLowerCase(), status: "assigned", stay_id: stay.toLowerCase() }, { member_id: id.toLowerCase(), status: "no_stay", dates: [FRI, SAT] }]);
    for (const value of [[], {}, [{ member_id: id, status: "booked" }], [{ member_id: "alex", status: "no_stay", dates: [FRI] }], [{ member_id: id, status: "no_stay" }],
      [{ member_id: id, status: "no_stay", stay_id: stay, dates: [FRI] }], [{ member_id: id, status: "assigned" }], [{ member_id: id, status: "unplanned", dates: [FRI, FRI] }],
      [{ member_id: id, status: "unplanned", dates: ["2026-02-30"] }], [{ member_id: id, status: "unplanned", dates: [] }],
      // Six people with 400 nights each: more than one change may plan.
      Array.from({ length: 6 }, () => ({ member_id: id, status: "unplanned", dates: Array.from({ length: 400 }, (_, day) => new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10)) }))]) {
      expect(parseAssignments(value)).toHaveProperty("error");
    }
  });
  it("reads attendance and occupants", () => {
    expect(parseAttendance({ arrival_date: SAT, departure_date: "", skipped_dates: [SUN, SAT] })).toEqual({ arrival_date: SAT, departure_date: null, skipped_dates: [SAT, SUN] });
    expect(parseAttendance({})).toEqual({ arrival_date: null, departure_date: null, skipped_dates: [] });
    for (const value of [null, [], { arrival_date: "Saturday" }, { departure_date: 3 }, { skipped_dates: [SAT, SAT] }]) expect(parseAttendance(value)).toHaveProperty("error");
    expect(parseOccupants(undefined)).toBeUndefined();
    expect(parseOccupants([])).toEqual([]);
    expect(parseOccupants(["1a000000-0000-4000-8000-000000000001", "1A000000-0000-4000-8000-000000000001"])).toHaveProperty("error");
  });

  it("says in words whose nights change, grouping people who change the same way (#332)", () => {
    expect(preview({ action: "assign", assignments: [BLAIR, DANA].map((entry) => ({ member_id: entry.id, status: "assigned" as const, stay_id: VILLAGE.id, dates: [SAT] })) }).summary)
      .toEqual(["Move Blair and Dana from Pine rental to Village hotel for the night of Sat Oct 10."]);
    expect(preview({ action: "assign", assignments: [{ member_id: ALEX.id, status: "assigned", stay_id: VILLAGE.id, dates: [FRI, SAT] }] }).summary)
      .toEqual(["Move Alex from Pine rental to Village hotel for the nights of Fri Oct 9 and Sat Oct 10."]);
    const rows = splitRows();
    rows.assignments = rows.assignments.filter((night) => night.stay_id !== VILLAGE.id);
    rows.stays = rows.stays.filter((stay) => stay.id !== VILLAGE.id);
    expect(preview({ action: "save", stay: input(VILLAGE), existing: false, occupants: [ELI.id, FRAN.id] }, rows).summary)
      .toEqual(["Put Eli and Fran (invitation pending) in Village hotel for the nights of Fri Oct 9 and Sat Oct 10."]);
    expect(preview({ action: "remove", id: PINE.id }).summary).toEqual([
      "Take Alex, Blair and Dana out of Pine rental for the nights of Fri Oct 9 and Sat Oct 10. Those nights become Not planned.",
      "Take Casey out of Pine rental for the night of Sat Oct 10. That night becomes Not planned."]);
    expect(preview({ action: "attendance", member_id: DANA.id, attendance: { arrival_date: null, departure_date: SUN, skipped_dates: [] } }).summary)
      .toEqual(["Take Dana off the trip for the nights of Sun Oct 11 and Mon Oct 12, and out of Mountain lodge."]);
    expect(preview({ action: "assign", assignments: [{ member_id: ELI.id, status: "no_stay", dates: [THU, FRI, SAT, MON] }] }).summary)
      .toEqual(["Change Eli from Not planned to No accommodation needed for the night of Thu Oct 8.",
        "Change Eli from Village hotel to No accommodation needed for the nights of Fri Oct 9 and Sat Oct 10.",
        "Change Eli from Mountain lodge to No accommodation needed for the night of Mon Oct 12."]);
    expect(preview({ action: "assign", assignments: [{ member_id: ALEX.id, status: "unplanned", dates: [FRI, SAT, SUN, MON] }] }).summary)
      .toEqual(["Take Alex out of Pine rental for the nights of Fri Oct 9 and Sat Oct 10. Those nights become Not planned.",
        "Take Alex out of Mountain lodge for the nights of Sun Oct 11 and Mon Oct 12. Those nights become Not planned."]);
    const alone = splitRows();
    alone.assignments = alone.assignments.filter((night) => night.member_id !== ALEX.id);
    const cabin = { ...input(PINE), id: "2b000000-0000-4000-8000-000000000009", name: "Cabin", check_out: "2026-10-13" };
    expect(preview({ action: "save", stay: cabin, existing: false, occupants: [ALEX.id] }, alone).summary).toEqual(["Put Alex in Cabin for the nights of Fri Oct 9 through Mon Oct 12."]);
    expect(preview({ action: "save", stay: input(PINE, { notes: "Code at the door" }), existing: true }).summary).toEqual([]);
  });
});
