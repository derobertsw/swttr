import type { Trip, TripMember } from "@/types/trips";

/**
 * Whether `userId` may change `member`'s day kit: their own, or as the
 * organizer, a guest's, since guests have no account to do it themselves.
 * The kit API enforces this, and the trip day shows edit controls only where
 * it's true.
 */
export function canEditMemberKit(
  trip: Pick<Trip, "owner_user_id">,
  member: Pick<TripMember, "user_id">,
  userId: string | null
): boolean {
  if (!userId) return false;
  return member.user_id === userId || (member.user_id === null && trip.owner_user_id === userId);
}
