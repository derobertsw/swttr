// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseCandidate, stayWindowChoices, summarizeCandidate } from "@/lib/trip-stay-candidates";
import { place } from "@/test/driveTrip";
import { SPLIT_TRIP } from "@/test/splitStays";

const id = "3c000000-0000-4000-8000-000000000001";
const RIDGE = place("Ridge chalet", 44.5012, -72.7519);

describe("Stay options (#213)", () => {
  it("keeps an option's fields, trimmed, with its estimated cost", () => {
    expect(parseCandidate({ id, name: "  Ridge chalet ", check_in: "2026-10-09", check_out: "2026-10-11", address: "", property_url: "https://example.com/ridge",
      notes: " Hot tub ", location: RIDGE, cost_amount: "1,240.5", cost_currency: "CAD", booking_status: "booked", extra: true })).toEqual({
      id, name: "Ridge chalet", check_in: "2026-10-09", check_out: "2026-10-11", address: null, property_url: "https://example.com/ridge",
      notes: "Hot tub", location: RIDGE, cost_amount: 1240.5, cost_currency: "CAD",
    });
    // A name is enough; without an amount the currency isn't kept.
    expect(parseCandidate({ id, name: "Brook inn", cost_amount: "", cost_currency: "USD" })).toMatchObject({ check_in: null, location: null, cost_amount: null, cost_currency: null });
  });

  it("says which field to fix", () => {
    const field = (input: Record<string, unknown>) => { const result = parseCandidate({ id, name: "Ridge chalet", ...input }); return "field" in result ? result.field : null; };
    expect(field({ name: " " })).toBe("name");
    expect(field({ id: "not-a-uuid" })).toBe("name");
    expect(field({ check_in: "2026-10-09" })).toBe("check_out");
    expect(field({ check_in: "2026-10-11", check_out: "2026-10-09" })).toBe("check_out");
    expect(field({ property_url: "javascript:alert(1)" })).toBe("property_url");
    expect(field({ location: { ...RIDGE, latitude: 0, longitude: 0 } })).toBe("location");
    expect(field({ cost_amount: "about 800", cost_currency: "USD", check_in: "2026-10-09", check_out: "2026-10-11" })).toBe("cost_amount");
    expect(field({ cost_amount: 12.345, cost_currency: "USD", check_in: "2026-10-09", check_out: "2026-10-11" })).toBe("cost_amount");
    expect(field({ cost_amount: -1, cost_currency: "USD", check_in: "2026-10-09", check_out: "2026-10-11" })).toBe("cost_amount");
    expect(field({ cost_amount: 800, check_in: "2026-10-09", check_out: "2026-10-11" })).toBe("cost_currency");
    expect(field({ cost_amount: 800, cost_currency: "BTC", check_in: "2026-10-09", check_out: "2026-10-11" })).toBe("cost_currency");
    // A cost is for the option's nights.
    expect(field({ cost_amount: 800, cost_currency: "USD" })).toBe("check_in");
  });

  it("labels an option's nights and cost, and its nights outside the trip", () => {
    const row = { id, trip_id: SPLIT_TRIP.id, name: "Ridge chalet", check_in: "2026-10-07", check_out: "2026-10-09", address: null, property_url: null,
      notes: null, location: null, cost_amount: 1200, cost_currency: "EUR", revision: 2, created_at: "", updated_at: "" };
    expect(summarizeCandidate(SPLIT_TRIP, row)).toMatchObject({ date_label: "Wed Oct 7 → Fri Oct 9 · 2 nights",
      cost_label: "About €1,200 total for Wed Oct 7 → Fri Oct 9 · 2 nights", review_dates: ["2026-10-07"] });
    expect(summarizeCandidate(SPLIT_TRIP, { ...row, check_in: null, check_out: null, cost_amount: null, cost_currency: null })).toMatchObject({ date_label: "Nights not set", cost_label: null });
  });

  it("offers the nights a comparison can cover", () => {
    const choices = stayWindowChoices(SPLIT_TRIP);
    expect(choices.first_nights.map((night) => night.label)).toEqual(["Night before the trip · Thu Oct 8", "Night of Fri Oct 9", "Night of Sat Oct 10", "Night of Sun Oct 11", "Night of Mon Oct 12 · Last night"]);
    expect(choices.checkouts.map((morning) => morning.label)).toEqual(["Morning of Fri Oct 9", "Morning of Sat Oct 10", "Morning of Sun Oct 11", "Morning of Mon Oct 12", "Morning of Tue Oct 13 · after the last night"]);
    expect(choices.default_window).toEqual({ first_night: "2026-10-09", checkout: "2026-10-12" });
    expect(stayWindowChoices({ start_date: "2026-10-09", end_date: "2026-10-09" }).default_window).toEqual({ first_night: "2026-10-08", checkout: "2026-10-09" });
  });
});
