/**
 * Roads closed for the winter that routing would otherwise use (#209). The
 * provider doesn't know about seasonal closures: without these, Stowe to
 * Smugglers' Notch Resort comes back as 9 minutes through the closed Notch
 * instead of the 75 minute detour. A day in a closure's season avoids its
 * points. The seasons are the usual ones; actual dates move with the
 * weather, so estimates still say to check road conditions.
 *
 * Add a road only after checking its closure against the state's own
 * notices, and check each point is on the closed stretch (reverse geocode
 * it) so it can't block an open road nearby.
 */
export interface WinterClosure {
  id: string;
  /** Shown in Estimate details: "Avoids <label>, <season>." */
  label: string;
  season: string;
  /** Inclusive month-day range across the new year, e.g. 11-01 to 05-15. */
  from: string;
  to: string;
  points: Array<{ latitude: number; longitude: number }>;
}

const WINTER_CLOSURES: WinterClosure[] = [
  {
    // VTrans closes it with the first winter weather (early to late
    // November) and reopens it around mid-May.
    id: "vt-108-smugglers-notch",
    label: "VT 108 through Smugglers' Notch",
    season: "usually closed November to mid-May",
    from: "11-01",
    to: "05-15",
    points: [{ latitude: 44.5555, longitude: -72.7947 }],
  },
  {
    // Massachusetts DCR closes the summit roads at the end of October.
    id: "ma-mount-greylock-summit-roads",
    label: "Mount Greylock's summit roads",
    season: "usually closed late October to mid-May",
    from: "10-31",
    to: "05-15",
    points: [
      { latitude: 42.6354, longitude: -73.1646 }, // Summit Road
      { latitude: 42.5752, longitude: -73.205 }, // Rockwell Road above the visitor center
      { latitude: 42.6505, longitude: -73.1611 }, // Notch Road above the gate
    ],
  },
];

type Point = { latitude: number; longitude: number };

/** The closures in season on a calendar date (YYYY-MM-DD). */
export function closuresOn(date: string): WinterClosure[] {
  const day = date.slice(5);
  return WINTER_CLOSURES.filter(({ from, to }) => from <= to ? day >= from && day <= to : day >= from || day <= to);
}

function kilometres(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad, dLon = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 12_742 * Math.asin(Math.sqrt(h));
}

/**
 * The closures a drive on `date` could run into: in season, with a point
 * inside a generous ellipse around the two ends. A drive in Vermont doesn't
 * avoid, or mention, Mount Greylock.
 */
export function closuresFor(date: string, from: Point, to: Point): WinterClosure[] {
  const direct = kilometres(from, to);
  return closuresOn(date).filter((closure) => closure.points.some((point) =>
    kilometres(from, point) + kilometres(point, to) <= direct * 1.5 + 40));
}
