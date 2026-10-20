import type { TripMapPlace, TripMapRole } from "@/types/trip-map";

export type MapDisplayRole = TripMapRole | "tonight" | "meeting";

export function placeDates(place: TripMapPlace): string[] {
  return [...new Set(place.visits.map((visit) => visit.date))];
}

export const roleLabels: Record<MapDisplayRole, string> = {
  stay: "Stay", destination: "Destination", origin: "Starting from", access: "Access", meeting: "Meeting point", tonight: "Staying tonight", pickup: "Pickup",
};

export function placeRoles(place: TripMapPlace, date = ""): TripMapRole[] {
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
