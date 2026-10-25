import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { TOUR_ACTIVITY } from "@/lib/trip-activities";
import { resolveTripStop } from "@/lib/trip-forecast";
import { isCalendarDate } from "@/lib/trip-lodging";
import { parseDayMeetEdit, returnsAfterMeet } from "@/lib/trip-meets";
import { lookupTimeZone } from "@/lib/trip-tour-plans";
import { requireTripAccess } from "@/lib/trips";
import type { TripDay, TripStop } from "@/types/trips";

type Context = { params: Promise<{ id: string; date: string }> };

/**
 * Sets or clears the day's meet time (#333), for every sport:
 * `{day_id, meet_time, meet_day_offset, expected}`, with `meet_time` null to
 * clear it. Organizer only, like every logistics edit; `expected` is the meet
 * time as the editor showed it. Where the crew meets is the day's access point.
 */
export async function PUT(request: Request, context: Context) {
  const { id, date } = await context.params;
  const auth = await requireTripAccess(id, { organizerOnly: true });
  if (auth instanceof NextResponse) return auth;
  if (!isCalendarDate(date)) return jsonError("Not found", 404);
  const edit = parseDayMeetEdit(await readJson(request));
  if ("error" in edit) return NextResponse.json(edit, { status: 400 });

  let timeZone: string | null = null;
  if (edit.meet_time) {
    const [{ data: day }, { data: stops }] = await Promise.all([
      auth.supabase.from("trip_days").select("*").eq("trip_id", id).eq("date", date).maybeSingle(),
      auth.supabase.from("trip_stops").select("*").eq("trip_id", id).order("position"),
    ]);
    if (!day) return jsonError("This day isn't on the trip anymore. Reload the trip.", 404);
    const stop = resolveTripStop(day as TripDay, (stops ?? []) as TripStop[]);
    // A tour plan in use still returns after the meet (#210).
    if (((day as TripDay).activity ?? stop?.activities[0]) === TOUR_ACTIVITY) {
      const { data: plan } = await auth.supabase.from("trip_day_tour_plans")
        .select("return_time, return_day_offset").eq("trip_day_id", (day as TripDay).id).maybeSingle();
      if (plan && !returnsAfterMeet({ time: edit.meet_time, offset: edit.meet_day_offset }, { time: plan.return_time, offset: plan.return_day_offset })) {
        return NextResponse.json({ error: "Meet before the tour plan's return target, or change the return target in the tour plan.", field: "meet_time" }, { status: 400 });
      }
    }
    timeZone = await lookupTimeZone(stop);
  }

  const { error } = await auth.supabase.rpc("set_trip_day_meet",
    { p_trip_id: id, p_user_id: auth.userId, p_payload: { date, ...edit, time_zone: timeZone } });
  if (error?.code === "40001" || error?.code === "PT409") return jsonError("The meet time changed since you opened this. Check it, then try again.", 409);
  // Before migration 20261024230000 the function doesn't exist.
  if (error?.code === "PGRST202" || error?.code === "42883") {
    return NextResponse.json({ error: "Meet times can't be saved yet. Try again later.", field: "meet_time" }, { status: 503 });
  }
  if (error?.code === "42501") return jsonError("Organizer only", 403);
  if (error?.code === "P0002") return jsonError("This day isn't on the trip anymore. Reload the trip.", 404);
  if (error?.code === "22023") return NextResponse.json({ error: "Check the meet time and try again.", field: "meet_time" }, { status: 400 });
  if (error) return jsonError("Couldn't save the meet time. Nothing was changed; try again.", 500);
  return NextResponse.json({ ok: true });
}
