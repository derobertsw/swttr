/**
 * A trip's four local sections (#330) and the pages each one owns. Older
 * page URLs keep working: each belongs to the section that now holds it, so
 * its tab shows as current.
 */
import type { TripFull } from "@/types/trips";

export type TripSectionId = "plan" | "stays" | "crew" | "packing";

interface TripSection {
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

/** Opens the trip on the right day for the person (#334): see `openTripPath`. */
export function tripOpenHref(tripId: string) {
  return `/trips/${tripId}/days`;
}

const planPathKey = (tripId: string) => `swttr-trip-plan-path:${tripId}`;
const openedPathKey = (tripId: string) => `swttr-trip-opened-path:${tripId}`;

/** Plan's own page or one of its days, on this trip. */
export function isPlanPath(path: string, tripId: string) {
  const location = tripLocation(path, tripId);
  return location?.section === "plan" && (location.subpath === "" || location.date !== null);
}

function readSession(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    // Storage can be blocked.
    return null;
  }
}

function writeSession(key: string, value: string | null) {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    // Not saved: Plan still remembers within the page.
  }
}

/** The Plan page this tab last showed for the trip. */
export function savedPlanPath(tripId: string): string | null {
  const saved = readSession(planPathKey(tripId));
  return saved && isPlanPath(saved, tripId) ? saved : null;
}

export function savePlanPath(tripId: string, path: string) {
  writeSession(planPathKey(tripId), path);
  // Once Plan shows another page, coming back to the day the trip opened on is a pick.
  if (path !== readSession(openedPathKey(tripId))) writeSession(openedPathKey(tripId), null);
}

/**
 * Where opening the trip goes (#334). A day this tab picked wins, unless the
 * trip is underway and that day is over. Otherwise it's the day the server
 * chose for the person, or Plan's own page on a trip that's over. A day it
 * opens on isn't a pick until Plan shows another page: opening again asks
 * the server again, so planning that day moves the trip on to the next.
 */
export function openTripPath(tripId: string, trip: Pick<TripFull, "days" | "focus">): string {
  const saved = savedPlanPath(tripId);
  const picked = saved && saved !== readSession(openedPathKey(tripId)) ? tripLocation(saved, tripId)?.date : null;
  const focus = trip.focus;
  if (picked && trip.days.some((day) => day.date === picked) && !(focus?.reason === "today" && focus.date && picked < focus.date)) {
    return saved!;
  }
  if (!focus?.date) return `/trips/${tripId}`;
  const path = `/trips/${tripId}/days/${focus.date}`;
  writeSession(openedPathKey(tripId), path);
  return path;
}
