import { NextRequest, NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { parseTripSettings, previewDateChange } from "@/lib/trip-dates";
import { isCalendarDate } from "@/lib/trip-lodging";
import { requireTripAccess, classifyTripStatus, loadTripFull } from "@/lib/trips";
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
    const full = await loadTripFull(supabase, id);
    if (!full) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(full);
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
    const full = await loadTripFull(supabase, id);
    return full && previewDateChange(full, start, end);
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

  const { data, error } = await supabase.rpc("change_trip_dates", {
    p_trip_id: id, p_user_id: userId,
    p_from_start: from.start_date, p_from_end: from.end_date,
    p_start: start, p_end: end, p_mode: mode,
    p_status: classifyTripStatus(start, end),
    p_name: name ?? null,
    p_lodging_revision: body.lodging_revision ?? null,
    p_expected_removed: expectedRemoved,
  });
  if (error?.code === "40001") {
    // Something changed since the review. Show the change as it would be now.
    const current = await preview().catch(() => null);
    return NextResponse.json({ error: "The trip changed since you reviewed it. Review the changes again.", ...(current ?? {}) }, { status: 409 });
  }
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
