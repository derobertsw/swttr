import { describe, expect, it } from "vitest";
import { parseItineraryEdit, previewItinerary, requestFor } from "@/lib/trip-itinerary";
import { ORGANIZER, STOWE_STOP, TRIP, tripFull } from "@/test/tripApi";
import type { TripDay, TripMember, TripMemberDayKit } from "@/types/trips";

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

  it("moves a stop's only day to a stop already at the picked place, rather than duplicating it", () => {
    const only = options(previewItinerary(full, { action: "set_day_place", date: "2026-10-12", place: { name: STOWE_STOP.name, latitude: 44.47, longitude: -72.69 } }));
    expect(only).toEqual([expect.objectContaining({
      key: "stop", label: "Only Mon Oct 12",
      detail: "Uses Stowe, Vermont, already a stop on this trip. Jay Peak, Vermont will have no days.",
      changes: [expect.objectContaining({ before: "Jay Peak, Vermont · No activity", after: "Stowe, Vermont · No activity" })],
      payload: expect.objectContaining({ scope: "stop", expected: { stop_id: JAY.id, stop: { name: JAY.name, latitude: JAY.latitude, longitude: JAY.longitude }, dates: ["2026-10-12"] } }),
    })]);
  });

  it("lists the days whose stop moves to a place with the same name, telling them apart by coordinates", () => {
    const [onlyThisDay, everyDay] = options(previewItinerary(full, { action: "set_day_place", date: "2026-10-10", place: { name: STOWE_STOP.name, latitude: 45, longitude: -73 } }));
    expect(onlyThisDay.changes.map(({ before, after }) => [before, after])).toEqual([["Stowe, Vermont (stop 1) · No activity", "Stowe, Vermont (stop 3) · No activity"]]);
    expect(everyDay.changes.map(({ date, before, after }) => [date, before, after])).toEqual([
      ["2026-10-10", "Stowe, Vermont (44.47, -72.69) · No activity", "Stowe, Vermont (45, -73) · No activity"],
      ["2026-10-11", "Stowe, Vermont (base) (44.47, -72.69) · Hike", "Stowe, Vermont (base) (45, -73) · Hike"],
    ]);
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

describe("Kits in itinerary reviews", () => {
  const SAM: TripMember = { ...ORGANIZER, id: "member-sam", user_id: "user-2", display_name: "Sam", role: "member" };
  const ALEX: TripMember = { ...SAM, id: "member-alex", user_id: "user-3", display_name: "Alex", status: "left" };
  const kit = (date: string, member: TripMember, fields: Partial<TripMemberDayKit>): TripMemberDayKit => ({
    id: `kit-${date}-${member.id}`, trip_day_id: `day-${date}`, trip_member_id: member.id, effort: "steady", items: [], note: null, state: "ok",
    updated_at: `${date}T08:00:00.000000+00:00`, outfit: null, outfit_saved_at: null, ...fields,
  });
  const outfit = { version: 1 } as unknown as TripMemberDayKit["outfit"];
  const withKits = (kits: TripMemberDayKit[]) => ({ ...full, members: [ORGANIZER, SAM, ALEX], kits });

  it("lists the kits kept as saved on each day whose plan changes, yours first, and only kits that count", () => {
    const trip = withKits([
      kit("2026-10-10", SAM, { outfit }), kit("2026-10-10", ORGANIZER, { items: ["shell"] }),
      kit("2026-10-11", SAM, { note: "Only a note" }), kit("2026-10-11", ALEX, { outfit }),
      kit("2026-10-12", SAM, { outfit }),
    ]);
    const [assign] = options(previewItinerary(trip, { action: "assign_days", dates: ["2026-10-10", "2026-10-11"], activity: "Ski touring" }, "user-1"));
    expect(assign.changes.map(({ date, notes }) => [date, notes])).toEqual([
      ["2026-10-10", ["Kept as saved for the old plan: your checklist and Sam's outfit."]],
      ["2026-10-11", undefined],
    ]);
  });

  it("copies the day's plan without kits, naming the source", () => {
    const [only] = options(previewItinerary(withKits([]), { action: "copy_day", from: "2026-10-12", dates: ["2026-10-10", "2026-10-11"], kit: false }, "user-1"));
    expect(only).toMatchObject({
      key: "copy", label: "Copy Mon Oct 12 to 2 days", detail: "Jay Peak, Vermont · No activity. Kits stay on their own days.",
      changes: [
        { date: "2026-10-10", before: "Stowe, Vermont · No activity", after: "Jay Peak, Vermont · No activity" },
        { date: "2026-10-11", before: "Stowe, Vermont (base) · Hike", after: "Jay Peak, Vermont · No activity" },
      ],
      payload: { from: "2026-10-12", dates: ["2026-10-10", "2026-10-11"], kit: "none" },
    });
  });

  it("asks whether to replace or keep your kits already on the days, with no default", () => {
    const trip = withKits([
      kit("2026-10-10", ORGANIZER, { outfit }),
      kit("2026-10-11", ORGANIZER, { items: ["jacket"] }), kit("2026-10-11", SAM, { outfit }),
    ]);
    const [replace, keep] = options(previewItinerary(trip, { action: "copy_day", from: "2026-10-10", dates: ["2026-10-11", "2026-10-12"], kit: true }, "user-1"));
    expect(replace).toMatchObject({
      key: "replace", label: "Replace your kit on Sun Oct 11",
      detail: "Every day gets Stowe, Vermont · No activity and your outfit. The copied outfit keeps the forecast it was planned for, so check each day in Gear up.",
      changes: [
        { date: "2026-10-11", notes: ["Your kit here is replaced with your outfit from Sat Oct 10.", "Kept as saved for the old plan: Sam's outfit."] },
        { date: "2026-10-12", notes: ["Gets your outfit from Sat Oct 10."] },
      ],
      payload: { kit: "replace", expected: { from: { kit: "2026-10-10T08:00:00.000000+00:00" }, days: [{ date: "2026-10-11", kit: "2026-10-11T08:00:00.000000+00:00" }, { date: "2026-10-12", kit: null }] } },
    });
    expect(keep).toMatchObject({
      key: "keep", label: "Keep your kit on Sun Oct 11",
      changes: [
        { date: "2026-10-11", notes: ["Kept as saved for the old plan: your checklist and Sam's outfit."] },
        { date: "2026-10-12", notes: ["Gets your outfit from Sat Oct 10."] },
      ],
      payload: { kit: "keep" },
    });
  });

  it("lists a day whose plan stays the same when it gets your kit", () => {
    const trip = withKits([kit("2026-10-11", ORGANIZER, { items: ["shell"] })]);
    // Monday already has Sunday's plan.
    const sunday = options(previewItinerary({ ...trip, days: [...trip.days.slice(0, 2), { ...trip.days[2], stop_id: null, activity: "Hike" }] },
      { action: "copy_day", from: "2026-10-11", dates: ["2026-10-12"], kit: true }, "user-1"))[0];
    expect(sunday.changes).toEqual([{ date: "2026-10-12", date_label: "Mon Oct 12", before: "Stowe, Vermont (base) · Hike", after: "Stowe, Vermont (base) · Hike", notes: ["Gets your checklist from Sun Oct 11."] }]);
    expect(sunday.unchanged).toBe(2);
  });

  it("lists a copy between two stops with the same name, telling them apart by stop number", () => {
    const otherStowe = { ...STOWE_STOP, id: "stop-stowe-2", position: 2, latitude: 44.6, longitude: -72.8 };
    const trip = { ...withKits([kit("2026-10-12", SAM, { items: ["shell"] })]), stops: [STOWE_STOP, JAY, otherStowe],
      days: [day("2026-10-10", STOWE_STOP.id), day("2026-10-11", null, "Hike"), day("2026-10-12", otherStowe.id)] };
    expect(options(previewItinerary(trip, { action: "copy_day", from: "2026-10-10", dates: ["2026-10-12"], kit: false }, "user-1"))[0].changes).toEqual([{
      date: "2026-10-12", date_label: "Mon Oct 12",
      before: "Stowe, Vermont (stop 3) · No activity", after: "Stowe, Vermont (stop 1) · No activity",
      notes: ["Kept as saved for the old plan: Sam's checklist."],
    }]);
  });

  it("numbers same-named stops the same way on both sides when one is removed", () => {
    const otherStowe = { ...STOWE_STOP, id: "stop-stowe-2", position: 1, latitude: 44.6, longitude: -72.8 };
    const trip = { ...withKits([]), stops: [STOWE_STOP, otherStowe], days: [day("2026-10-10", STOWE_STOP.id, "Hike"), day("2026-10-11", otherStowe.id)] };
    const [only] = options(previewItinerary(trip, { action: "remove_stop", stop_id: STOWE_STOP.id }, "user-1"));
    expect(only.changes.map(({ date, before, after }) => [date, before, after])).toEqual([
      ["2026-10-10", "Stowe, Vermont (stop 1) · Hike", "Stowe, Vermont (stop 2) · Hike"],
    ]);
  });

  it("refuses a copy onto its own day, to missing days, or of a kit you don't have", () => {
    const trip = withKits([kit("2026-10-10", SAM, { outfit })]);
    expect(previewItinerary(trip, { action: "copy_day", from: "2026-10-10", dates: ["2026-10-10"], kit: false }, "user-1")).toMatchObject({ status: 400 });
    expect(previewItinerary(trip, { action: "copy_day", from: "2026-10-10", dates: ["2026-10-13"], kit: false }, "user-1")).toMatchObject({ status: 404 });
    expect(previewItinerary(trip, { action: "copy_day", from: "2026-10-09", dates: ["2026-10-11"], kit: false }, "user-1")).toMatchObject({ status: 404 });
    expect(previewItinerary(trip, { action: "copy_day", from: "2026-10-10", dates: ["2026-10-11"], kit: true }, "user-1")).toEqual({ error: "You have no kit on Sat Oct 10 to copy.", status: 400 });
    // Sam's kit is Sam's to copy.
    expect(previewItinerary(trip, { action: "copy_day", from: "2026-10-10", dates: ["2026-10-11"], kit: true }, "user-2")).toMatchObject({ options: [{ key: "copy" }] });
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

  it("rebuilds a copy from validated fields only, and maps it back to the preview request", () => {
    const stopId = "5b7f1f7e-3c52-4c39-9d0e-0a3c1f0b6a11";
    const place = { id: stopId.toUpperCase(), name: "Stowe, Vermont", latitude: 44.47, longitude: -72.69 };
    const expected = { from: { stop_id: stopId.toUpperCase(), activity: "Hike", stop: { ...place, extra: true }, kit: "2026-10-08T12:00:00+00:00", extra: true }, days: [{ date: "2026-10-11", stop_id: null, activity: null, stop: null, kit: null }] };
    const copy = parseItineraryEdit({ action: "copy_day", from: "2026-10-10", dates: ["2026-10-11", "2026-10-11"], kit: "keep", expected, sneaky: 1 });
    expect(copy).toEqual({ action: "copy_day", payload: {
      from: "2026-10-10", dates: ["2026-10-11"], kit: "keep",
      expected: {
        from: { stop_id: stopId, activity: "Hike", stop: { ...place, id: stopId }, kit: "2026-10-08T12:00:00+00:00" },
        days: [{ date: "2026-10-11", stop_id: null, activity: null, stop: null, kit: null }],
      },
    } });
    expect("error" in copy ? null : requestFor(copy)).toEqual({ action: "copy_day", from: "2026-10-10", dates: ["2026-10-11"], kit: true });
    for (const bad of [{ kit: "merge" }, { kit: undefined }, { from: "2026-02-30" }, { dates: [] }, { expected: { ...expected, days: [{ date: "2026-10-11", kit: "yesterday" }] } }, { expected: { days: [] } },
      { expected: { ...expected, days: [{ date: "2026-10-11", stop: { ...place, latitude: "44.47" } }] } }, { expected: { ...expected, from: { stop: { name: "Stowe" } } } }]) {
      expect(parseItineraryEdit({ action: "copy_day", from: "2026-10-10", dates: ["2026-10-11"], kit: "keep", expected, ...bad })).toHaveProperty("error");
    }
  });
});
