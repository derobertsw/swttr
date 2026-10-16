import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { requireTripAccess } from "@/lib/trips";
import { isCalendarDate, isUuid } from "@/lib/trip-lodging";
import { resolveTripStop } from "@/lib/trip-forecast";
import { lookupTimeZone, parseTourPlan } from "@/lib/trip-tour-plans";
import type { TripDay, TripStop } from "@/types/trips";

type Context = { params: Promise<{ id: string; date: string }> };

/** Saves the day's tour plan (#210): `{plan, day_id, expected_revision, mutation_id}`. Organizer only. */
export async function PUT(request: Request, context: Context) {
  return mutate(request, context, "save");
}

/** Removes the day's tour plan: `{day_id, expected_revision, mutation_id}`. Organizer only. */
export async function DELETE(request: Request, context: Context) {
  return mutate(request, context, "remove");
}

async function mutate(request: Request, context: Context, action: "save" | "remove") {
  const { id, date } = await context.params;
  const auth = await requireTripAccess(id, { organizerOnly: true });
  if (auth instanceof NextResponse) return auth;
  if (!isCalendarDate(date)) return jsonError("Not found", 404);
  const body = await readJson(request);
  if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError("Invalid request.", 400);
  const plan = action === "save" ? parseTourPlan(body.plan) : null;
  if (plan && "error" in plan) return NextResponse.json(plan, { status: 400 });
  const revision = body.expected_revision;
  if (!Number.isSafeInteger(revision) || (revision as number) < (action === "remove" ? 1 : 0)) {
    return jsonError("Reload the saved tour plan before editing.", 400);
  }
  if (!isUuid(body.mutation_id)) return jsonError("Invalid save identity. Reopen the editor.", 400);
  // The day the editor opened for: after a date change, another day can hold this date.
  if (!isUuid(body.day_id)) return jsonError("Reload the trip before editing.", 400);

  let timeZone: string | null = null;
  if (plan && (plan.meet_time || plan.return_time)) {
    const [{ data: day }, { data: stops }] = await Promise.all([
      auth.supabase.from("trip_days").select("*").eq("trip_id", id).eq("date", date).maybeSingle(),
      auth.supabase.from("trip_stops").select("*").eq("trip_id", id).order("position"),
    ]);
    if (!day) return jsonError("This day is no longer on the trip. Reload the trip.", 404);
    timeZone = await lookupTimeZone(resolveTripStop(day as TripDay, (stops ?? []) as TripStop[]));
  }

  const { data, error } = await auth.supabase.rpc("mutate_trip_tour_plan", {
    p_trip_id: id, p_user_id: auth.userId, p_date: date, p_day_id: body.day_id, p_expected_revision: revision,
    p_request_id: body.mutation_id, p_action: action, p_payload: plan ? { ...plan, time_zone: timeZone } : {},
  });
  if (error) {
    if (error.code === "40001") return jsonError("The tour plan or this day changed. Review the saved plan before saving again.", 409);
    if (error.code === "P0002") return jsonError("This day is no longer on the trip. Reload the trip.", 404);
    if (error.code === "42501") return jsonError("Not found", 404);
    if (error.code === "22023") return jsonError("This save identity was already used. Reopen the editor.", 409);
    if (error.code === "22000" || error.code === "23514") return jsonError("Check the tour plan and try again.", 400);
    return jsonError(`Couldn't ${action === "save" ? "save" : "remove"} the tour plan. Your changes are still here; try again.`, 500);
  }
  return NextResponse.json(data);
}
