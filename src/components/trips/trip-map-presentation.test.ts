import { describe, expect, it } from "vitest";
import { tripDriveEstimates } from "@/lib/trip-drive-estimates";
import { projectTripMap } from "@/lib/trip-map";
import { LODGE_PLACE, PINE_PLACE, splitDriveTrip, VILLAGE_PLACE } from "@/test/driveTrip";
import { ALEX, CASEY, ELI, LODGE, MON, PINE, SAT, VILLAGE } from "@/test/splitStays";
import type { TripMap } from "@/types/trip-map";
import { dayRoles, followDeparture, placeRoles, roleLabels } from "./trip-map-presentation";

/**
 * Saturday of the split-stay journey (#333): Alex, Blair and Dana leave the
 * Pine rental and Eli and Fran the Village hotel, for the same lot; Casey
 * arrives that evening. Found in #235: whoever the map followed, the other
 * group's stay also read "Starting from" (or only "Stay"), so the map showed
 * two starts with nothing to say whose.
 */
const MINUTES: Record<string, number> = { [PINE_PLACE.latitude]: 12, [VILLAGE_PLACE.latitude]: 18, [LODGE_PLACE.latitude]: 3 };
const matrix = async (sources: Array<{ latitude: number }>, targets: unknown[]) =>
  sources.map((source) => targets.map(() => ({ seconds: MINUTES[source.latitude] * 60, meters: 9_000 })));
async function mapOn(date: string): Promise<TripMap> {
  const full = splitDriveTrip();
  return projectTripMap(full, await tripDriveEstimates(full, { read: async () => [], write: async () => undefined }, { now: Date.parse("2026-10-05T15:00:00Z"), matrix }), date);
}
const pine = `stay:${PINE.id}:location`, village = `stay:${VILLAGE.id}:location`, lodge = `stay:${LODGE.id}:location`;

describe("Day roles with several departures (#333, #235)", () => {
  it("names one start per view and marks the other group's start as another departure", async () => {
    const map = await mapOn(SAT);
    const [saturday] = map.days;
    const roles = (memberId: string | null, key: string | null = null) => {
      const day = followDeparture(saturday, memberId, key);
      return Object.fromEntries(map.places.map((place) => [place.id, dayRoles(place, day)]));
    };
    // Alex follows the rental; the hotel is Eli and Fran's start.
    expect(roles(ALEX.id)).toMatchObject({ [pine]: ["origin", "tonight"], [village]: ["departure"] });
    // Eli follows the hotel; the rental is the other departure, not just last night's stay.
    expect(roles(ELI.id)).toMatchObject({ [pine]: ["departure"], [village]: ["origin", "tonight"] });
    // Eli shows the rental's drive: it starts there, and Eli still sleeps at the hotel.
    expect(roles(ELI.id, `stay:${PINE.id}`)).toMatchObject({ [pine]: ["origin"], [village]: ["tonight"] });
    // Casey isn't taking part and sees the crew's day.
    expect(roles(CASEY.id)).toMatchObject({ [pine]: ["origin", "tonight"], [village]: ["departure"] });
    for (const view of [roles(ALEX.id), roles(ELI.id), roles(CASEY.id), roles(null)]) {
      expect(Object.values(view).filter((entry) => entry.includes("origin"))).toHaveLength(1);
    }
    const other = map.places.find((place) => place.id === village)!;
    expect(placeRoles(other, SAT, followDeparture(saturday, ALEX.id)).map((role) => roleLabels[role])).toEqual(["Other departure"]);
  });

  it("has no other departure when everyone leaves from one place", async () => {
    const map = await mapOn(MON);
    const [monday] = map.days;
    expect(monday.departures).toHaveLength(1);
    expect(map.places.flatMap((place) => dayRoles(place, followDeparture(monday, ELI.id)))).not.toContain("departure");
    expect(dayRoles(map.places.find((place) => place.id === lodge)!, monday)).toEqual(["origin", "tonight"]);
  });
});
