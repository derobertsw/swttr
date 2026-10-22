/**
 * A trip's four local sections (#330) and the pages each one owns. Older
 * page URLs keep working: each belongs to the section that now holds it, so
 * its tab shows as current.
 */
export type TripSectionId = "plan" | "stays" | "crew" | "packing";

export interface TripSection {
  id: TripSectionId;
  label: string;
  /** The section's own page, below /trips/<id>. */
  path: string;
}

export const TRIP_SECTIONS: readonly TripSection[] = [
  { id: "plan", label: "Plan", path: "" },
  { id: "stays", label: "Stays", path: "/stays" },
  { id: "crew", label: "Crew", path: "/manage" },
  { id: "packing", label: "Packing", path: "/pack" },
];

// The first path segment below /trips/<id>. Day, map, destination and
// settings pages are part of the plan; shared gear is part of Packing and
// roll call part of Crew.
const SECTION_OF_SEGMENT: Record<string, TripSectionId> = {
  "": "plan",
  days: "plan",
  map: "plan",
  stops: "plan",
  settings: "plan",
  stays: "stays",
  manage: "crew",
  rollcall: "crew",
  pack: "packing",
  gear: "packing",
};

/** Where a pathname is within a trip, or null when it isn't a trip page. */
export function tripLocation(pathname: string, tripId: string): {
  section: TripSectionId | null;
  /** The pathname below /trips/<id>, like "" or "/days/2026-01-09". */
  subpath: string;
  /** The day a day page shows. */
  date: string | null;
} | null {
  const base = `/trips/${tripId}`;
  if (pathname !== base && !pathname.startsWith(`${base}/`)) return null;
  const subpath = pathname.slice(base.length).replace(/\/$/, "");
  const [segment = "", next] = subpath.split("/").slice(1);
  return {
    section: SECTION_OF_SEGMENT[segment] ?? null,
    subpath,
    date: segment === "days" && next ? safeDecode(next) : null,
  };
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function tripSectionHref(tripId: string, section: TripSection) {
  return `/trips/${tripId}${section.path}`;
}
