import { describe, expect, it } from "vitest";
import { tripFocusFor } from "@/lib/trip-focus";
import { buildLodging } from "@/lib/trip-lodging";
import { ORGANIZER, SAM, STOWE_STOP, TRIP, tripFull } from "@/test/tripApi";
import type { TripDay, TripFull, TripLocation, TripMemberDayKit } from "@/types/trips";

const day = (date: string, overrides: Partial<TripDay> = {}): TripDay =>
  ({ id: `day-${date}`, trip_id: TRIP.id, date, stop_id: STOWE_STOP.id, activity: "Alpine", ...overrides }) as TripDay;
const kit = (date: string, memberId = ORGANIZER.id) =>
  ({ id: `kit-${date}-${memberId}`, trip_day_id: `day-${date}`, trip_member_id: memberId, items: [], state: "ok" }) as unknown as TripMemberDayKit;
const DAYS = [day("2026-10-10"), day("2026-10-11"), day("2026-10-12")];
const at = (iso: string) => Date.parse(iso);
const BEFORE = at("2026-10-01T12:00:00Z");

function trip(overrides: Partial<TripFull> = {}) {
  return tripFull({ stops: [STOWE_STOP], days: DAYS, ...overrides });
}

describe("Where a trip opens (#334)", () => {
  it("opens a trip ahead on your first day still to plan, then on its first day once every day is planned", () => {
    expect(tripFocusFor(trip(), "user-1", BEFORE)).toEqual({
      date: "2026-10-10", reason: "unfinished", next_step: { kind: "plan_kit", date: "2026-10-10" } });
    const kits = [kit("2026-10-10")];
    expect(tripFocusFor(trip({ kits }), "user-1", BEFORE)).toMatchObject({ date: "2026-10-11", reason: "unfinished" });
    // Someone else's kit doesn't plan your day.
    expect(tripFocusFor(trip({ kits: [kit("2026-10-10", SAM.id)] }), "user-1", BEFORE).date).toBe("2026-10-10");
    const days = [day("2026-10-10"), day("2026-10-11", { activity: null }), day("2026-10-12")];
    expect(tripFocusFor(trip({ days, kits }), "user-1", BEFORE)).toMatchObject({
      date: "2026-10-11", next_step: { kind: "choose_activity", date: "2026-10-11" } });
    const planned = DAYS.map((entry) => kit(entry.date));
    expect(tripFocusFor(trip({ kits: planned }), "user-1", BEFORE)).toEqual({ date: "2026-10-10", reason: "first_day", next_step: null });
  });

  it("skips Travel and Rest days and days you aren't taking part in, which have no clothing to plan", () => {
    const days = [day("2026-10-10", { activity: "Travel" }), day("2026-10-11", { activity: "Rest" }), day("2026-10-12")];
    expect(tripFocusFor(trip({ days }), "user-1", BEFORE)).toMatchObject({ date: "2026-10-12", next_step: { date: "2026-10-12" } });
    const members = [ORGANIZER];
    const attendance = [{ trip_id: TRIP.id, member_id: ORGANIZER.id, arrival_date: null, departure_date: null, skipped_dates: ["2026-10-12"] }];
    const lodging = buildLodging(TRIP, [], [], { members, attendance, per_member: true });
    expect(tripFocusFor(trip({ days, members, lodging }), "user-1", BEFORE)).toEqual({ date: "2026-10-10", reason: "first_day", next_step: null });
  });

  it("opens on today during the trip, by the destination's clock, and never offers a day that's over", () => {
    const denver: TripLocation = { label: "Base lot", address: null, latitude: 39.6, longitude: -106, precision: "exact",
      time_zone: "America/Denver", source: "search", provider: null, provider_id: null, attribution: null };
    const stops = [{ ...STOWE_STOP, access_point: denver }];
    // 3 AM UTC on the 11th is still the evening of the 10th in Denver.
    const evening = at("2026-10-11T03:00:00Z");
    expect(tripFocusFor(trip({ stops }), "user-1", evening)).toMatchObject({ date: "2026-10-10", reason: "today" });
    // Without the zone, the UTC date stands in.
    expect(tripFocusFor(trip(), "user-1", evening)).toMatchObject({ date: "2026-10-11", reason: "today" });
    // The 10th has no kit, but it's over: the next step is from today on.
    expect(tripFocusFor(trip({ kits: [kit("2026-10-11")] }), "user-1", at("2026-10-11T15:00:00Z"))).toEqual({
      date: "2026-10-11", reason: "today", next_step: { kind: "plan_kit", date: "2026-10-12" } });
  });

  it("opens Plan's own page on a trip that's over or has no days, and asks for a destination first", () => {
    expect(tripFocusFor(trip(), "user-1", at("2026-11-01T12:00:00Z"))).toEqual({ date: null, reason: null, next_step: null });
    expect(tripFocusFor(trip({ days: [] }), "user-1", BEFORE)).toEqual({ date: null, reason: null, next_step: null });
    expect(tripFocusFor(trip({ stops: [], days: [day("2026-10-10", { stop_id: null })] }), "user-1", BEFORE)).toEqual({
      date: "2026-10-10", reason: "unfinished", next_step: { kind: "add_destination", date: null } });
  });
});
