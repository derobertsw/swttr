import type { TripGroupGear } from "@/types/trips";

type SharedGearStatus = "assigned" | "awaiting" | "accepted" | "packed";

/**
 * An assigned shared item's state as the shared gear list says it (#179).
 * Assignment alone is never agreement: it's Awaiting acceptance until the
 * person accepts it. A snapshot from before acceptance tracking can only say
 * Assigned.
 */
export function sharedGearStatus(item: Pick<TripGroupGear, "accepted_at" | "packed_at">): { status: SharedGearStatus; label: string } {
  if (item.accepted_at === undefined) return { status: "assigned", label: "Assigned" };
  if (item.packed_at) return { status: "packed", label: "Packed" };
  if (item.accepted_at) return { status: "accepted", label: "Accepted · not packed" };
  return { status: "awaiting", label: "Awaiting acceptance" };
}
