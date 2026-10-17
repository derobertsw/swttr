import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { requireTripAccess } from "@/lib/trips";
import { isCalendarDate, isUuid } from "@/lib/trip-lodging";
import { parseConditionsSource } from "@/lib/trip-conditions";

type Context = { params: Promise<{ id: string; date: string }> };

const ACTIONS = ["add", "save", "remove"] as const;

/**
 * Changes the day's conditions sources (#211). Organizer only. The body is
 * `{action, day_id, mutation_id}`, with `source` to add one, `source_id`,
 * `expected_revision` and `source` to save one, or `source_id` and
 * `expected_revision` to remove it from the day. Removing keeps its reviews.
 */
export async function POST(request: Request, context: Context) {
  const { id, date } = await context.params;
  const auth = await requireTripAccess(id, { organizerOnly: true });
  if (auth instanceof NextResponse) return auth;
  if (!isCalendarDate(date)) return jsonError("Not found", 404);
  const body = await readJson(request);
  if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError("Invalid request.", 400);
  const action = ACTIONS.find((option) => option === body.action);
  if (!action) return jsonError("Invalid request.", 400);
  const source = action === "remove" ? null : parseConditionsSource(body.source);
  if (source && "error" in source) return NextResponse.json(source, { status: 400 });
  const revision = body.expected_revision;
  if (action !== "add" && (!isUuid(body.source_id) || !Number.isSafeInteger(revision) || (revision as number) < 1)) {
    return jsonError("Reload the day's sources before editing.", 400);
  }
  if (!isUuid(body.mutation_id)) return jsonError("Invalid save identity. Reopen the editor.", 400);
  // The day the editor opened for: after a date change, another day can hold this date.
  if (!isUuid(body.day_id)) return jsonError("Reload the trip before editing.", 400);

  const { data, error } = await auth.supabase.rpc("mutate_trip_conditions_source", {
    p_trip_id: id, p_user_id: auth.userId, p_date: date, p_day_id: body.day_id,
    p_source_id: action === "add" ? null : body.source_id, p_expected_revision: action === "add" ? 0 : revision,
    p_request_id: body.mutation_id, p_action: action, p_payload: source ?? {},
  });
  if (error) {
    switch (error.code) {
      case "40001": return jsonError("This day or its sources changed. Review them before saving again.", 409);
      case "P0002": return jsonError("This day is no longer on the trip. Reload the trip.", 404);
      case "42501": return jsonError("Not found", 404);
      case "22023": return jsonError("This save identity was already used. Reopen the editor.", 409);
      case "22000": case "23502": case "23514": return jsonError("Check the source and try again.", 400);
      // Migration 031 isn't applied yet.
      case "42883": case "42P01": case "PGRST202": return jsonError("Conditions sources can't be saved yet. Try again later.", 503);
    }
    return jsonError(`Couldn't ${action === "remove" ? "remove" : "save"} the source. Your changes are still here; try again.`, 500);
  }
  return NextResponse.json(data);
}
