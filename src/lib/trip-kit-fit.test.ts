import { describe, expect, it } from "vitest";
import { outfitMismatches } from "@/lib/trip-kit-fit";
import { STOWE_STOP } from "@/test/tripApi";
import { savedOutfit } from "@/test/savedKit";

// The fixture outfit is alpine skiing at Stowe, planned for Sat Oct 10.
const outfit = savedOutfit();
const place = outfit.weather.context?.place ?? outfit.outing.place.name;

describe("Where a saved outfit doesn't fit its day", () => {
  it("says nothing when the outfit was planned for this day's place, date and activity", () => {
    expect(outfitMismatches(outfit, { date: "2026-10-10", activity: "Alpine", stop: STOWE_STOP })).toEqual([]);
  });

  it("names another place, and a day with no destination", () => {
    expect(outfitMismatches(outfit, { date: "2026-10-10", activity: null, stop: { ...STOWE_STOP, name: "Jay Peak", latitude: 44.94, longitude: -72.5 } }))
      .toEqual([`Saved for ${place}, not this day's stop (Jay Peak).`]);
    expect(outfitMismatches(outfit, { date: "2026-10-10", activity: null, stop: null }))
      .toEqual([`Saved for ${place}, and this day has no destination.`]);
  });

  it("names another date's forecast and another activity, but doesn't compare an activity Gear up has no match for", () => {
    expect(outfitMismatches(outfit, { date: "2026-10-12", activity: "Hike", stop: STOWE_STOP })).toEqual([
      "Planned for the forecast on Sat Oct 10, not this day's.",
      "Planned for Alpine Skiing, not this day's activity (Hike).",
    ]);
    expect(outfitMismatches(outfit, { date: "2026-10-10", activity: "Rest", stop: STOWE_STOP })).toEqual([]);
  });

  it("compares a day without its own activity with its stop's first, as the day page shows it", () => {
    const hiking = { ...STOWE_STOP, activities: ["Hike", "Alpine"] };
    expect(outfitMismatches(outfit, { date: "2026-10-10", activity: null, stop: hiking }))
      .toEqual(["Planned for Alpine Skiing, not this day's activity (Hike)."]);
    expect(outfitMismatches(outfit, { date: "2026-10-10", activity: "Alpine", stop: hiking })).toEqual([]);
  });
});
