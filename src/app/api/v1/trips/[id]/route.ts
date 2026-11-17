import { NextRequest, NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { loadConditions } from "@/lib/trip-conditions";
import { parseTripSettings, previewDateChange } from "@/lib/trip-dates";
import { isCalendarDate } from "@/lib/trip-lodging";
import { requireTripAccess, classifyTripStatus, loadTripFull, tripFullFor } from "@/lib/trips";
import type { Trip, TripDateChangePreview } from "@/types/trips";

type RouteContext = { params: Promise<{ id: string }> };

/** A name and dates, plus for a date change the review it confirms. */
type DateChangeRequest = {
  name?: unknown; start_date?: unknown; end_date?: unknown;
  preview?: unknown; mode?: unknown; lodging_revision?: unknown; expected_removed?: unknown;
  from?: { start_date?: unknown; end_date?: unknown };
};

export async function GET(_request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const auth = await requireTripAccess(id);
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;

  try {
    const full = await loadTripFull(supabase, auth.trip);
    if (!full) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(tripFullFor(full, auth.userId));
  } catch {
    return NextResponse.json({ error: "Couldn't load the trip. Try again." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  // Any member on the trip may change the shared itinerary (#176).
  const auth = await requireTripAccess(id);
  if (auth instanceof NextResponse) return auth;
  const { supabase, trip, userId } = auth;

  const body = await readJson<DateChangeRequest>(request);
  const input = parseTripSettings(body, trip);
  if (!body || "error" in input) return NextResponse.json(input, { status: 400 });
  const { name, start_date: start, end_date: end } = input;

  if (start === trip.start_date && end === trip.end_date) {
    if (body.preview === true) return NextResponse.json({ date_change: null });
    const { data, error } = await supabase
      .from("trips")
      .update({ ...(name === undefined ? {} : { name }), status: classifyTripStatus(start, end) })
      .eq("id", id)
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: "Couldn't save the trip. Try again." }, { status: 500 });
    return NextResponse.json({ trip: data });
  }

  const preview = async () => {
    // Every conditions review on the trip (#211): a removed day takes its reviews with it, of sources no longer listed there too.
    const [full, conditions] = await Promise.all([loadTripFull(supabase, id), loadConditions(supabase, id)]);
    return full && previewDateChange(tripFullFor(full, userId), start, end, conditions);
  };
  let reviewed: TripDateChangePreview | null;
  try {
    reviewed = await preview();
  } catch {
    return NextResponse.json({ error: "Couldn't preview the date change. Try again." }, { status: 500 });
  }
  if (!reviewed) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (body.preview === true) return NextResponse.json(reviewed);

  const mode = body.mode ?? (reviewed.plans.move ? undefined : "keep");
  if (mode !== "keep" && !(mode === "move" && reviewed.plans.move)) {
    return NextResponse.json({ error: reviewed.plans.move ? "Choose whether to move the plan or keep it on its dates." : "Only a trip that keeps its length can move its plan.", ...reviewed }, { status: 409 });
  }
  const from = body.from ?? { start_date: trip.start_date, end_date: trip.end_date };
  if (!isCalendarDate(from?.start_date) || !isCalendarDate(from.end_date)) return jsonError("Reload the trip before changing its dates.", 400);
  if (body.lodging_revision != null && !Number.isSafeInteger(body.lodging_revision)) return jsonError("Reload the trip before changing its dates.", 400);
  const expectedRemoved = body.expected_removed ?? [];
  if (!Array.isArray(expectedRemoved) || expectedRemoved.length > 400 || expectedRemoved.some((day: unknown) => !day || typeof day !== "object" || Array.isArray(day))) {
    return jsonError("Reload the trip before changing its dates.", 400);
  }

  const change = (removedDays: unknown[]) => supabase.rpc("change_trip_dates", {
    p_trip_id: id, p_user_id: userId,
    p_from_start: from.start_date, p_from_end: from.end_date,
    p_start: start, p_end: end, p_mode: mode,
    p_status: classifyTripStatus(start, end),
    p_name: name ?? null,
    p_lodging_revision: body.lodging_revision ?? null,
    p_expected_removed: removedDays,
  });
  const conflict = (code: string | undefined) => code === "40001" || code === "PT409";
  const reviewAgain = async () => {
    // Something changed since the review. Show the change as it would be now.
    const current = await preview().catch(() => null);
    return NextResponse.json({ error: "The trip changed since you reviewed it. Review the changes again.", ...(current ?? {}) }, { status: 409 });
  };
  // A removed day's conditions sources and reviews (#211) must be the ones the
  // review listed, as they are now. change_trip_dates checks them again under
  // the trip lock from migration 20261116210000 on; before it, this is the
  // only check.
  // Each date's conditions, in a comparable form; the function checks the dates themselves.
  const conditionsOf = (days: object[]) => new Map(days.flatMap((day) => {
    const { date, conditions } = day as { date?: unknown; conditions?: { source_ids?: unknown; entries?: unknown } };
    if (!conditions) return [];
    const ids = Array.isArray(conditions.source_ids) ? [...conditions.source_ids].map(String).sort() : null;
    return [[String(date), JSON.stringify({ source_ids: ids, entries: conditions.entries ?? null })]];
  }));
  const [seen, now] = [conditionsOf(expectedRemoved), conditionsOf(reviewed.plans[mode]?.expected_removed ?? [])];
  if (seen.size !== now.size || [...now].some(([date, conditions]) => seen.get(date) !== conditions)) return reviewAgain();
  let { data, error } = await change(expectedRemoved);
  // Before migration 20261116210000, change_trip_dates doesn't list a removed
  // day's conditions, so a review that lists them never matches there. It's
  // tried once more without them, which only that older function can accept:
  // from the migration on, a day with any source or review is listed with
  // them, and a review without them doesn't match.
  if (conflict(error?.code) && expectedRemoved.some((day: object) => "conditions" in day)) {
    ({ data, error } = await change(expectedRemoved.map((day: object) => Object.fromEntries(Object.entries(day).filter(([key]) => key !== "conditions")))));
  }
  if (conflict(error?.code)) return reviewAgain();
  if (error?.code === "42501") return jsonError("Not found", 404);
  if (error?.code === "22023") return jsonError("Choose valid dates for this trip.", 400);
  if (error) return jsonError("Couldn't change the dates. Nothing was changed; try again.", 500);
  return NextResponse.json({ trip: (data as { trip: Trip }).trip });
}

export async function DELETE(_request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const auth = await requireTripAccess(id, { organizerOnly: true });
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;

  const { error } = await supabase.from("trips").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
