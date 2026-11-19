import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { jsonError, readJson } from "@/lib/api";
import { loadTripFull, requireTripAccess } from "@/lib/trips";
import { isCalendarDate, isUuid } from "@/lib/trip-lodging";
import { loadConditions, parseConditionsSource, previewConditionsAttach, previewConditionsEdit, sameDays } from "@/lib/trip-conditions";
import type { Trip } from "@/types/trips";

type Context = { params: Promise<{ id: string; date: string }> };

const ACTIONS = ["add", "save", "remove", "attach"] as const;
const MAX_DAYS = 400;
type ReviewedDay = { date: string; day_id: string };

/** The `{date, day_id}` list a review showed, or null when it's malformed. */
function reviewedDays(value: unknown): ReviewedDay[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_DAYS) return null;
  const days = value.map((entry) => entry && typeof entry === "object" && !Array.isArray(entry)
    && isCalendarDate(entry.date) && isUuid(entry.day_id) ? { date: entry.date as string, day_id: (entry.day_id as string).toLowerCase() } : null);
  return days.every((day) => day !== null) ? days as ReviewedDay[] : null;
}

/** What listing the source on `dates` does, read now; null when it can't be read. */
async function attachPreview(supabase: SupabaseClient, trip: Trip, sourceId: string, dates: string[]) {
  const [full, rows] = await Promise.all([loadTripFull(supabase, trip), loadConditions(supabase, trip.id)]);
  return full ? previewConditionsAttach(rows, full, sourceId, dates) : null;
}

/**
 * Changes the day's conditions sources (#211). Organizer only. The body is
 * `{action, day_id, mutation_id}`, with `source` to add one, `source_id`,
 * `expected_revision` and `source` to save one, or `source_id` and
 * `expected_revision` to remove it from the day. Removing keeps its reviews.
 *
 * Reuse (#211, PR 2): saving can send `expected_days`, the days an edit's
 * review listed, and is refused (409) when the source is on other days now.
 * `{action: "save", preview: true, source_id, source}` returns that review.
 * `{action: "attach", preview: true, source_id, dates}` reviews listing a
 * source the trip has on more days, and `{action: "attach", source_id,
 * expected_revision, days, mutation_id}` saves it, with the review's
 * `revision` and `expected_days`.
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
  if (action === "attach") return attach(auth, body);
  const source = action === "remove" ? null : parseConditionsSource(body.source);
  if (source && "error" in source) return NextResponse.json(source, { status: 400 });

  if (body.preview === true) {
    if (action !== "save" || !source || !isUuid(body.source_id)) return jsonError("Invalid request.", 400);
    let full;
    try { full = await loadTripFull(auth.supabase, auth.trip); }
    catch { return jsonError("Couldn't load the review. Try again.", 500); }
    if (!full) return jsonError("Not found", 404);
    // The editor opened from this day. Once the source is off it, saving is refused, so the review is too, and the editor checks the latest.
    const sourceId = body.source_id.toLowerCase();
    if (full.conditions && !full.conditions.some((listing) => listing.id === sourceId && listing.date === date)
      && full.conditions_sources?.some((candidate) => candidate.id === sourceId)) {
      return jsonError("This day or its sources changed. Review them before saving again.", 409);
    }
    const review = previewConditionsEdit(full, sourceId, source);
    return "error" in review ? jsonError(review.error, review.status) : NextResponse.json(review);
  }

  const revision = body.expected_revision;
  if (action !== "add" && (!isUuid(body.source_id) || !Number.isSafeInteger(revision) || (revision as number) < 1)) {
    return jsonError("Reload the day's sources before editing.", 400);
  }
  if (!isUuid(body.mutation_id)) return jsonError("Invalid save identity. Reopen the editor.", 400);
  // The day the editor opened for: after a date change, another day can hold this date.
  if (!isUuid(body.day_id)) return jsonError("Reload the trip before editing.", 400);
  // An edit reviewed for the days the source was on (PR 2) saves only while it's on those days.
  const expectedDays = action === "save" && body.expected_days !== undefined ? reviewedDays(body.expected_days) : undefined;
  if (expectedDays === null) return jsonError("Reload the trip before editing.", 400);
  if (expectedDays) {
    let full;
    try { full = await loadTripFull(auth.supabase, auth.trip); }
    catch { return jsonError("Couldn't save the source. Your changes are still here; try again.", 500); }
    const now = previewConditionsEdit(full ?? { conditions: [], conditions_sources: [] }, (body.source_id as string).toLowerCase(), source!);
    if ("error" in now || !sameDays(now.expected_days, expectedDays)) {
      return jsonError("This source is listed on other days now. Check the latest before saving again.", 409);
    }
  }

  const { data, error } = await auth.supabase.rpc("mutate_trip_conditions_source", {
    p_trip_id: id, p_user_id: auth.userId, p_date: date, p_day_id: body.day_id,
    p_source_id: action === "add" ? null : body.source_id, p_expected_revision: action === "add" ? 0 : revision,
    p_request_id: body.mutation_id, p_action: action, p_payload: source ?? {},
  });
  if (error) {
    switch (error.code) {
      case "PT409":
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

/** Reviews or saves listing a source the trip has on more days. */
async function attach(auth: { supabase: SupabaseClient; trip: Trip; userId: string }, body: Record<string, unknown>) {
  if (!isUuid(body.source_id)) return jsonError("Reload the trip before listing this source.", 400);
  const sourceId = body.source_id.toLowerCase();
  if (body.preview === true) {
    const dates = Array.isArray(body.dates) && body.dates.length > 0 && body.dates.length <= MAX_DAYS && body.dates.every(isCalendarDate)
      ? body.dates as string[] : null;
    if (!dates) return jsonError("Choose days to list this source on.", 400);
    let review;
    try { review = await attachPreview(auth.supabase, auth.trip, sourceId, dates); }
    catch { return jsonError("Couldn't load the review. Try again.", 500); }
    if (!review) return jsonError("Not found", 404);
    return "error" in review ? jsonError(review.error, review.status) : NextResponse.json(review);
  }

  const days = reviewedDays(body.days);
  const revision = body.expected_revision;
  if (!days || !Number.isSafeInteger(revision) || (revision as number) < 1) return jsonError("Reload the trip before listing this source.", 400);
  if (!isUuid(body.mutation_id)) return jsonError("Invalid save identity. Reopen the review.", 400);
  const { data, error } = await auth.supabase.rpc("attach_trip_conditions_source", {
    p_trip_id: auth.trip.id, p_user_id: auth.userId, p_source_id: sourceId, p_expected_revision: revision,
    p_request_id: body.mutation_id, p_days: days,
  });
  if (error) {
    switch (error.code) {
      case "PT409":
      case "40001": {
        // Something changed since the review. Show it as it would be now.
        const current = await attachPreview(auth.supabase, auth.trip, sourceId, days.map((day) => day.date)).catch(() => null);
        return NextResponse.json({
          error: "The trip changed since you reviewed this. Review it again.",
          ...(current && !("error" in current) ? current : {}),
        }, { status: 409 });
      }
      case "42501": return jsonError("Not found", 404);
      case "22023": return jsonError("This save identity was already used. Reopen the review.", 409);
      case "22000": return jsonError("Choose days to list this source on.", 400);
      // Migration 20261116210000 isn't applied yet.
      case "42883": case "PGRST202": return jsonError("Listing a source on more days isn't available yet. Nothing was changed.", 503);
    }
    return jsonError("Couldn't list the source on these days. Nothing was changed; try again.", 500);
  }
  return NextResponse.json(data);
}
