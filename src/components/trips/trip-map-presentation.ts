import type { TripMapDay, TripMapPlace, TripMapRole } from "@/types/trip-map";

export type MapDisplayRole = TripMapRole | "tonight" | "meeting";

export function placeDates(place: TripMapPlace): string[] {
  return [...new Set(place.visits.map((visit) => visit.date))];
}

export const roleLabels: Record<MapDisplayRole, string> = {
  stay: "Stay", destination: "Destination", origin: "Starting from", access: "Access", meeting: "Meeting point", tonight: "Staying tonight", pickup: "Pickup",
};

/**
 * What a place is on the selected day, from the server's day references: the
 * morning origin, the access/meeting point and tonight's stay stay separate
 * even when one place fills several roles.
 */
export function dayRoles(place: TripMapPlace, day: TripMapDay): MapDisplayRole[] {
  const roles: MapDisplayRole[] = [];
  if (place.id === day.origin_place_id) roles.push("origin");
  if (place.id === day.access_place_id) roles.push(place.id === day.meeting_place_id ? "meeting" : "access");
  if (place.id === day.destination_place_id) roles.push("destination");
  if (place.id === day.tonight_place_id) roles.push("tonight");
  // Last night's crew stay while the day starts somewhere else.
  if (place.id === day.crew_stay_place_id && !roles.length) roles.push("stay");
  return roles;
}

export function placeRoles(place: TripMapPlace, date = "", day: TripMapDay | null = null): MapDisplayRole[] {
  const daily = day ? dayRoles(place, day) : [];
  if (daily.length) return daily;
  const roles = [...new Set(place.visits.filter((visit) => !date || visit.date === date).map((visit) => visit.role))];
  if (place.source.type === "stay") {
    const index = roles.indexOf("stay");
    if (index !== -1) roles.splice(index, 1);
    roles.unshift("stay");
  }
  if (!roles.length) roles.push(place.source.slot === "destination" ? "destination" : place.source.slot === "origin" ? "origin" : "access");
  return roles;
}

export function placeStatus(place: TripMapPlace): string {
  if (place.mapping === "missing_coordinates") return "Location not set";
  if (place.mapping === "invalid_coordinates") return "Saved location invalid";
  return place.precision === "approximate" ? "Approximate location" : place.precision === "unknown" ? "Location precision unconfirmed" : "Confirmed location";
}

export const roleSymbols: Record<MapDisplayRole, string> = { stay: "⌂", destination: "▲", origin: "●", access: "◆", meeting: "◆", tonight: "⌂", pickup: "■" };
