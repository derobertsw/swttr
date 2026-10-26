import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { loadTripFull, requireTripAccess } from "@/lib/trips";
import { isCalendarDate, isUuid } from "@/lib/trip-lodging";
import { canRecordDayCheck, dayTimeZone, isDayCheckKind, isTourDay } from "@/lib/trip-day-checks";
import { lookupTimeZone } from "@/lib/trip-tour-plans";

type Context = { params: Promise<{ id: string; date: string }> };

const ACTIONS = { record: "recorded", withdraw: "withdrawn" } as const;

/**
 * Records or withdraws a day check on a Backcountry day (#212): the signed-in
 * person's own, or a managed guest's for the organizer. The body is
 * `{action, kind, day_id, member_id, expected_entry_id, mutation_id}`, and to
 * record, `context_key`: what the check covers as the person saw it. A check
 * is recorded against what it covers now, so a change since they saw it is a
 * `409`.
 */
export async function POST(request: Request, context: Context) {
  const { id, date } = await context.params;
  const auth = await requireTripAccess(id);
  if (auth instanceof NextResponse) return auth;
  if (!isCalendarDate(date)) return jsonError("Not found", 404);
  const body = await readJson(request);
  if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError("Invalid request.", 400);
  const action = Object.hasOwn(ACTIONS, body.action as string) ? ACTIONS[body.action as keyof typeof ACTIONS] : null;
  if (!action || !isDayCheckKind(body.kind)) return jsonError("Invalid request.", 400);
  if (!isUuid(body.mutation_id)) return jsonError("Invalid save identity. Reload the trip.", 400);
  if (!isUuid(body.day_id) || !isUuid(body.member_id) || (body.expected_entry_id !== null && !isUuid(body.expected_entry_id))
    || (action === "recorded" && typeof body.context_key !== "string")) {
    return jsonError("Reload the trip before recording a check.", 400);
  }

  let full;
  try { full = await loadTripFull(auth.supabase, auth.trip); }
  catch { return jsonError("Couldn't save the check. Try again.", 500); }
  const day = full?.days.find((entry) => entry.date === date);
  if (!full || !day) return jsonError("This day is no longer on the trip. Reload the trip.", 404);
  // The day checks migration isn't applied yet.
  if (!full.day_checks) return jsonError("Day checks can't be recorded yet. Try again later.", 503);
  if (!full.members.some((member) => member.id === body.member_id && member.status !== "left")) {
    return jsonError("This person is no longer on the trip. Reload the trip.", 404);
  }
  if (!canRecordDayCheck(full, body.member_id as string, auth.userId)) {
    return jsonError("You can record only your own checks, or a managed guest's as the organizer.", 403);
  }
  if (day.id !== body.day_id || !isTourDay(full, day)) {
    return jsonError("This day changed since you opened it. Check the latest before saving.", 409);
  }

  let current = null;
  let zone = dayTimeZone(full, day);
  if (action === "recorded") {
    const check = full.day_checks?.find((entry) => entry.trip_day_id === day.id)?.checks
      .find((entry) => entry.member_id === body.member_id && entry.kind === body.kind);
    if (!check?.context_key || check.context_key !== body.context_key) {
      return jsonError("What this check covers changed since you opened the day. Check the latest before recording it.", 409);
    }
    // The key is the context as the server read it now, in canonical JSON.
    current = JSON.parse(check.context_key);
    zone ??= await lookupTimeZone(full.stops.find((stop) => stop.id === day.stop_id) ?? full.stops[0]);
  }

  const { data, error } = await auth.supabase.rpc("record_trip_day_check", {
    p_trip_id: id, p_user_id: auth.userId, p_date: date, p_day_id: body.day_id, p_member_id: body.member_id,
    p_kind: body.kind, p_expected_entry: body.expected_entry_id, p_request_id: body.mutation_id, p_action: action,
    p_context: current, p_time_zone: zone,
  });
  if (error) {
    switch (error.code) {
      case "PT409":
      case "40001": return jsonError("This check or the day changed. Check the latest before saving again.", 409);
      case "P0002": return jsonError("This day or person is no longer on the trip. Reload the trip.", 404);
      case "42501": return jsonError("You can record only your own checks, or a managed guest's as the organizer.", 403);
      case "22023": return jsonError("This save identity was already used. Reload the trip.", 409);
      case "22000": return jsonError("There's no recorded check to undo. Reload the trip.", 400);
      // The day checks migration isn't applied yet.
      case "42883": case "42P01": case "PGRST202": return jsonError("Day checks can't be recorded yet. Try again later.", 503);
    }
    return jsonError("Couldn't save the check. Try again.", 500);
  }
  return NextResponse.json(data);
}
