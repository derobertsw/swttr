import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { loadTripFull, requireTripAccess } from "@/lib/trips";
import { isCalendarDate, isUuid } from "@/lib/trip-lodging";
import { conditionsContext, parseReviewNote } from "@/lib/trip-conditions";

type Context = { params: Promise<{ id: string; date: string }> };

const ACTIONS = { record: "reviewed", correct: "corrected", withdraw: "withdrawn" } as const;

/**
 * Records, corrects or withdraws the signed-in person's own review of a
 * source on the day (#211). Anyone on the trip, for themselves only. The body
 * is `{action, day_id, source_id, expected_entry_id, mutation_id}`, with an
 * optional `note` to record or correct, and to record, `context_key`: the
 * day's plan as the person saw it. A review is recorded against the plan as
 * it is now, so a plan that changed since they saw it is a `409`.
 */
export async function POST(request: Request, context: Context) {
  const { id, date } = await context.params;
  const auth = await requireTripAccess(id);
  if (auth instanceof NextResponse) return auth;
  if (!isCalendarDate(date)) return jsonError("Not found", 404);
  const body = await readJson(request);
  if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError("Invalid request.", 400);
  const action = Object.hasOwn(ACTIONS, body.action as string) ? ACTIONS[body.action as keyof typeof ACTIONS] : null;
  if (!action) return jsonError("Invalid request.", 400);
  const note = action === "withdrawn" ? null : parseReviewNote(body.note);
  if (note && typeof note === "object") return NextResponse.json(note, { status: 400 });
  if (!isUuid(body.mutation_id)) return jsonError("Invalid save identity. Reopen the review.", 400);
  if (!isUuid(body.day_id) || !isUuid(body.source_id) || (body.expected_entry_id !== null && !isUuid(body.expected_entry_id))
    || (action === "reviewed" && typeof body.context_key !== "string")) {
    return jsonError("Reload the trip before recording a review.", 400);
  }

  let current = null;
  if (action === "reviewed") {
    let full;
    try { full = await loadTripFull(auth.supabase, auth.trip); }
    catch { return jsonError("Couldn't save your review. Your note is still here; try again.", 500); }
    const day = full?.days.find((entry) => entry.date === date);
    if (!full || !day) return jsonError("This day is no longer on the trip. Reload the trip.", 404);
    const source = full.conditions?.find((entry) => entry.trip_day_id === day.id && entry.id === body.source_id);
    if (day.id !== body.day_id || !source || source.context_key !== body.context_key) {
      return jsonError("This day's plan or the source changed since you opened it. Check the latest before recording your review.", 409);
    }
    current = conditionsContext(full, day, source);
  }

  const { data, error } = await auth.supabase.rpc("record_trip_conditions_review", {
    p_trip_id: id, p_user_id: auth.userId, p_date: date, p_day_id: body.day_id, p_source_id: body.source_id,
    p_expected_entry: body.expected_entry_id, p_request_id: body.mutation_id, p_action: action, p_note: note,
    p_context: current,
  });
  if (error) {
    switch (error.code) {
      case "40001": return jsonError("Your review or this day's sources changed. Check the latest before saving again.", 409);
      case "P0002": return jsonError("This day is no longer on the trip. Reload the trip.", 404);
      case "42501": return jsonError("Not found", 404);
      case "22023": return jsonError("This save identity was already used. Reopen the review.", 409);
      case "22000": return jsonError("There's no review to change. Reload the trip.", 400);
      // Migration 031 isn't applied yet.
      case "42883": case "42P01": case "PGRST202": return jsonError("Reviews can't be recorded yet. Try again later.", 503);
    }
    return jsonError("Couldn't save your review. Your note is still here; try again.", 500);
  }
  return NextResponse.json(data);
}
