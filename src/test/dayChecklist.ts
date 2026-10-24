import { buildLodging } from "@/lib/trip-lodging";
import { ALEX, BLAIR, CASEY, DANA, ELI, FRAN, FRI, MON, SAT, SPLIT_MEMBERS, SPLIT_TRIP, SUN, splitRows } from "@/test/splitStays";
import { tripFull } from "@/test/tripApi";
import type { TripDayConditionsSource, TripFull, TripGroupGear, TripMember, TripMemberDayKit } from "@/types/trips";

/**
 * The downhill reference journey (src/test/splitStays.ts) as a whole trip for
 * Day checklist tests (#336): at Stowe, where `savedOutfit()` was planned,
 * every day Downhill. Dana (a managed guest) and Fran (a pending invitation)
 * have no account.
 */
const CHECKLIST_USERS: Record<string, string | null> = { [ALEX.id]: "user-alex", [BLAIR.id]: "user-blair", [CASEY.id]: "user-casey", [DANA.id]: null, [ELI.id]: "user-eli", [FRAN.id]: null };
export const checklistMembers: TripMember[] = SPLIT_MEMBERS.map((member) => ({ ...member, trip_id: SPLIT_TRIP.id, user_id: CHECKLIST_USERS[member.id], invite_token: null, created_at: member.created_at! }));
const STOWE_STOP = { id: "stop-stowe", trip_id: SPLIT_TRIP.id, position: 0, name: "Stowe", latitude: 44.47, longitude: -72.69, activities: ["Downhill"], created_at: SPLIT_TRIP.created_at };
const days = [FRI, SAT, SUN, MON].map((date) => ({ id: `day-${date}`, trip_id: SPLIT_TRIP.id, stop_id: STOWE_STOP.id, date, activity: "Downhill" }));
export const kit = (memberId: string, date: string, overrides: Partial<TripMemberDayKit> = {}): TripMemberDayKit =>
  ({ id: `kit-${memberId}-${date}`, trip_day_id: `day-${date}`, trip_member_id: memberId, effort: "steady", items: [], note: null, state: "ok", updated_at: "2026-10-01T00:00:00Z", ...overrides });
export const gear = (id: string, assignee: string | null, overrides: Partial<TripGroupGear> = {}): TripGroupGear =>
  ({ id, trip_id: SPLIT_TRIP.id, description: id, assignee_member_id: assignee, sort_order: 0, created_at: "2026-10-01T00:00:00Z", accepted_at: null, packed_at: null, ...overrides });
export const source = (id: string, date: string, reviews: Array<{ user: string; stale?: boolean; action?: "reviewed" | "withdrawn"; at?: string }>): TripDayConditionsSource =>
  ({ id, date, trip_day_id: `day-${date}`, reviews: reviews.map((review) => ({ user_id: review.user, stale_reasons: review.stale ? ["Route changed"] : [], history: [],
    current: { id: `${id}-${review.user}`, action: review.action ?? "reviewed", note: null, reviewed_at: review.at ?? "2026-10-08T15:00:00Z", created_at: review.at ?? "2026-10-08T15:00:00Z" } })) }) as unknown as TripDayConditionsSource;

export function checklistTrip(overrides: Partial<TripFull> = {}): TripFull {
  const rows = splitRows();
  return tripFull({ trip: SPLIT_TRIP, members: checklistMembers, stops: [STOWE_STOP], days, kits: [], gear: [],
    lodging: buildLodging(SPLIT_TRIP, rows.stays, rows.assignments, { members: SPLIT_MEMBERS, attendance: rows.attendance, per_member: true }), ...overrides });
}
