import { describe, expect, it } from "vitest";
import { buildLodging, parseStay, previewLodging } from "@/lib/trip-lodging";
import { TRIP } from "@/test/tripApi";
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
    const preview = previewLodging(TRIP, lodging, "save", { ...hut, check_in: "2026-10-10" });
    expect(preview.conflicts).toEqual(["2026-10-10"]);
    expect(preview.nights[0]).toMatchObject({ before: "Hotel", after: "Hut", morning: "Sun Oct 11" });
    expect(preview.nights.map((night) => night.date)).toEqual(["2026-10-10", "2026-10-11", "2026-10-12"]);
  });
  it("previews removal and date changes without mutating the saved plan", () => {
    const lodging = buildLodging(TRIP, [STAY], [assigned(STAY, "2026-10-09"), assigned(STAY, "2026-10-10")]);
    expect(previewLodging(TRIP, lodging, "remove", { id: STAY.id }).nights[0]).toMatchObject({ before: "Hotel", after: "Not planned yet", morning: "Sat Oct 10" });
    expect(previewLodging(TRIP, lodging, "save", { ...STAY, check_in: null, check_out: null }).nights).toHaveLength(2);
    expect(lodging.stays[0].assigned_nights).toHaveLength(2);
    expect(previewLodging(TRIP, lodging, "save", { ...STAY, notes: "Meet in lobby" }).nights).toHaveLength(0);
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
