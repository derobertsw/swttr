import { describe, expect, it } from "vitest";
import { parseItineraryEdit, previewItinerary, requestFor } from "@/lib/trip-itinerary";
import { STOWE_STOP, TRIP, tripFull } from "@/test/tripApi";
import type { TripDay } from "@/types/trips";

const JAY = { ...STOWE_STOP, id: "stop-jay", position: 1, name: "Jay Peak, Vermont", latitude: 44.9379, longitude: -72.5045 };
const day = (date: string, stop_id: string | null, activity: string | null = null): TripDay => ({ id: `day-${date}`, trip_id: TRIP.id, date, stop_id, activity });
// Saturday and Sunday at Stowe (Sunday by inheriting the base), Monday at Jay Peak.
const full = tripFull({ stops: [STOWE_STOP, JAY], days: [day("2026-10-10", STOWE_STOP.id), day("2026-10-11", null, "Hike"), day("2026-10-12", JAY.id)] });
const options = (preview: ReturnType<typeof previewItinerary>) => {
  if ("error" in preview) throw new Error(preview.error);
  return preview.options;
};

describe("Itinerary previews", () => {
  it("uses a stop already at the picked place for one day, rather than adding another", () => {
    const [onlyThisDay, everyDay] = options(previewItinerary(full, { action: "set_day_place", date: "2026-10-11", place: { name: JAY.name, latitude: 44.93791, longitude: -72.5045 } }));
    expect(onlyThisDay).toMatchObject({ key: "day", detail: "Uses Jay Peak, Vermont, already a stop on this trip.", changes: [{ after: "Jay Peak, Vermont · Hike" }] });
    expect(everyDay).toMatchObject({ key: "stop", label: "Every day at Stowe, Vermont (2 days)" });
  });

  it("changes nothing when the day is already at the picked place", () => {
    expect(options(previewItinerary(full, { action: "set_day_place", date: "2026-10-10", place: { name: STOWE_STOP.name, latitude: 44.47, longitude: -72.69 } }))).toEqual([
      expect.objectContaining({ label: "Sat Oct 10 is already at Stowe, Vermont", changes: [], unchanged: 3 }),
    ]);
  });

  it("removes a stop no day uses with nothing to choose", () => {
    const unused = { ...JAY, id: "stop-unused", position: 2, name: "Smuggs" };
    expect(options(previewItinerary({ ...full, stops: [...full.stops, unused] }, { action: "remove_stop", stop_id: unused.id }))).toEqual([{
      key: "remove", label: "No day uses Smuggs", detail: "Every day keeps its destination.", changes: [], unchanged: 3,
      payload: { stop_id: unused.id, reassign_to: STOWE_STOP.id, expected: [] },
    }]);
  });

  it("rejects an order that doesn't list every stop once", () => {
    expect(previewItinerary(full, { action: "reorder_stops", order: [JAY.id, JAY.id] })).toMatchObject({ status: 400 });
    expect(previewItinerary(full, { action: "set_day_place", date: "2026-10-13", place: { name: "Jay", latitude: 1, longitude: 1 } })).toMatchObject({ status: 404 });
  });
});

describe("Saved itinerary changes", () => {
  it("keeps a cleared activity distinct from an unchanged one, and maps back to the preview request", () => {
    const stopId = "5b7f1f7e-3c52-4c39-9d0e-0a3c1f0b6a11";
    const clear = parseItineraryEdit({ action: "assign_days", dates: ["2026-10-10"], activity: null, expected: [] });
    const move = parseItineraryEdit({ action: "assign_days", dates: ["2026-10-10"], stop_id: stopId, expected: [] });
    expect(clear).toEqual({ action: "assign_days", payload: { dates: ["2026-10-10"], activity: null, expected: [] } });
    expect("error" in move ? null : requestFor(move)).toEqual({ action: "assign_days", dates: ["2026-10-10"], stop_id: stopId });
    expect("error" in clear ? null : requestFor(clear)).toEqual({ action: "assign_days", dates: ["2026-10-10"], activity: null });
  });
});
