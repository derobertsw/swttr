import type { LodgingMember, LodgingRows } from "@/lib/trip-lodging";
import { TRIP } from "@/test/tripApi";
import type { Trip, TripLodgingNight, TripMemberAttendance, TripStay } from "@/types/trips";

/**
 * The downhill reference journey (#329) for per-person lodging tests (#331),
 * Fri Oct 9 – Mon Oct 12, with Thursday the pre-trip night and Monday the last:
 * - Fri and Sat: Alex, Blair and Dana (a managed guest) in the Pine rental;
 *   Eli and Fran (a pending invitation) in the Village hotel.
 * - Casey arrives Saturday evening, skips Saturday and is the rental's fourth.
 * - Sun and Mon: all six in the Mountain lodge.
 */
export const SPLIT_TRIP: Trip = { ...TRIP, start_date: "2026-10-09", end_date: "2026-10-12", lodging_revision: 4 };
export const [THU, FRI, SAT, SUN, MON] = ["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12"];

const member = (id: string, display_name: string, status: LodgingMember["status"] = "joined", role: LodgingMember["role"] = "member"): LodgingMember =>
  ({ id, display_name, status, role });
export const ALEX = member("1a000000-0000-4000-8000-000000000001", "Alex", "joined", "organizer");
export const BLAIR = member("1a000000-0000-4000-8000-000000000002", "Blair");
export const CASEY = member("1a000000-0000-4000-8000-000000000003", "Casey");
export const DANA = member("1a000000-0000-4000-8000-000000000004", "Dana", "guest", "guest");
export const ELI = member("1a000000-0000-4000-8000-000000000005", "Eli");
export const FRAN = member("1a000000-0000-4000-8000-000000000006", "Fran", "invited");
export const SPLIT_MEMBERS = [ALEX, BLAIR, CASEY, DANA, ELI, FRAN].map((entry, index) => ({ ...entry, created_at: `2026-09-28T00:00:0${index}Z` }));

const splitStay = (id: string, name: string, checkIn: string | null, checkOut: string | null, index: number): TripStay => ({
  id, trip_id: SPLIT_TRIP.id, name, check_in: checkIn, check_out: checkOut, type: "rental", address: null, property_url: null,
  check_in_time: null, check_out_time: null, notes: null, booking_status: "booked", location: null,
  created_at: `2026-09-28T00:0${index}:00Z`, updated_at: `2026-09-28T00:0${index}:00Z`,
});
export const PINE = splitStay("2b000000-0000-4000-8000-000000000001", "Pine rental", FRI, SUN, 0);
export const VILLAGE = splitStay("2b000000-0000-4000-8000-000000000002", "Village hotel", FRI, SUN, 1);
export const LODGE = splitStay("2b000000-0000-4000-8000-000000000003", "Mountain lodge", SUN, "2026-10-13", 2);

export const personNight = (memberId: string, date: string, stay: TripStay | null): TripLodgingNight =>
  ({ trip_id: SPLIT_TRIP.id, member_id: memberId, date, stay_id: stay?.id ?? null, status: stay ? "assigned" : "no_stay" });
const CASEY_EVENING: TripMemberAttendance = { trip_id: SPLIT_TRIP.id, member_id: CASEY.id, arrival_date: SAT, departure_date: null, skipped_dates: [SAT] };

/** The journey's saved rows; pass `attendance: []` for Casey on the whole trip. */
export function splitRows({ attendance = [CASEY_EVENING] }: { attendance?: TripMemberAttendance[] } = {}): LodgingRows {
  const assignments = [
    ...[ALEX, BLAIR, DANA].flatMap((entry) => [personNight(entry.id, FRI, PINE), personNight(entry.id, SAT, PINE)]),
    personNight(CASEY.id, SAT, PINE),
    ...[ELI, FRAN].flatMap((entry) => [personNight(entry.id, FRI, VILLAGE), personNight(entry.id, SAT, VILLAGE)]),
    ...SPLIT_MEMBERS.flatMap((entry) => [personNight(entry.id, SUN, LODGE), personNight(entry.id, MON, LODGE)]),
  ];
  return { stays: [PINE, VILLAGE, LODGE], assignments, attendance, per_member: true };
}
