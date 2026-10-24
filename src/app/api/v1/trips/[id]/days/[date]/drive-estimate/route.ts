import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { departurePlans } from "@/lib/trip-drive";
import { parseDriveEstimatePrefer, parseDriveEstimateRemove, parseDriveEstimateSave } from "@/lib/trip-drive-edits";
import { isCalendarDate } from "@/lib/trip-lodging";
import { loadTripFull, requireTripAccess } from "@/lib/trips";

type Context = { params: Promise<{ id: string; date: string }> };
type Action = "save" | "remove" | "prefer";

const STALE = "Your estimate or this day's drive changed since you opened it. Check it, then try again.";
const FAILED: Record<Action, string> = {
  save: "Couldn't save your estimate. Your entry is still here; try again.",
  remove: "Couldn't remove your estimate. Try again.",
  prefer: "Couldn't change which estimate is used. Try again.",
};

/**
 * Saves your own estimate (#209) for a drive on the day and any days with the
 * same drive: `{pair_key, duration_seconds, note, dates, clear, expected}`.
 * Since #333 it's kept per day and drive, so each departure can have one;
 * `clear` and `expected` name each `{date, pair_key}`. It's for the pair the
 * organizer saw, so a drive no departure has any more is refused.
 */
export async function PUT(request: Request, context: Context) {
  return mutate(request, context, "save");
}

/** Uses the calculated estimate for the same drive instead, or yours again: `{pair_key, use_calculated, expected}`. */
export async function PATCH(request: Request, context: Context) {
  return mutate(request, context, "prefer");
}

/** Removes your estimate for a drive from the day and the days that shared it: `{pair_key, dates, expected}`. */
export async function DELETE(request: Request, context: Context) {
  return mutate(request, context, "remove");
}

async function mutate(request: Request, context: Context, action: Action) {
  const { id, date } = await context.params;
  const auth = await requireTripAccess(id, { organizerOnly: true });
  if (auth instanceof NextResponse) return auth;
  if (!isCalendarDate(date)) return jsonError("Not found", 404);
  const body = await readJson(request);

  let payload: Record<string, unknown>;
  if (action === "save") {
    const edit = parseDriveEstimateSave(date, body);
    if ("error" in edit) return NextResponse.json(edit, { status: 400 });
    // Every day it's saved for must still have the drive the organizer saw, whoever takes it (#333).
    let departures;
    try {
      const full = await loadTripFull(auth.supabase, auth.trip);
      if (!full) return jsonError("Not found", 404);
      departures = departurePlans(full).flat();
    } catch {
      return jsonError(FAILED.save, 500);
    }
    if (!departures.some((plan) => plan.date === date)) return jsonError("This day isn't on the trip anymore. Reload the trip.", 404);
    const plan = departures.find((candidate) => candidate.date === date && candidate.pair_key === edit.pair_key);
    if (!plan || edit.dates.some((day) => !departures.some((candidate) => candidate.date === day && candidate.pair_key === edit.pair_key))) {
      return jsonError(STALE, 409);
    }
    const { pair_key: pairKey, duration_seconds: seconds, note, dates, clear, expected } = edit;
    payload = {
      estimate: { pair_key: pairKey, origin_label: plan.origin!.label, destination_label: plan.destination!.label, duration_seconds: seconds, note },
      dates, clear, expected,
    };
  } else {
    const edit = action === "remove" ? parseDriveEstimateRemove(date, body) : parseDriveEstimatePrefer(date, body);
    if ("error" in edit) return NextResponse.json(edit, { status: 400 });
    payload = action === "prefer" ? { ...edit, dates: [date] } : edit;
  }

  const { error } = await auth.supabase.rpc("set_trip_drive_pair_estimate", { p_trip_id: id, p_user_id: auth.userId, p_action: action, p_payload: payload });
  if (error?.code === "40001" || error?.code === "PT409") return jsonError(STALE, 409);
  // Before migration 20261023233000 the function doesn't exist.
  if (error?.code === "PGRST202" || error?.code === "42883") {
    return NextResponse.json({ error: "Your own estimates can't be saved yet. Try again later.", field: "duration" }, { status: 503 });
  }
  if (error?.code === "42501") return jsonError("Organizer only", 403);
  if (error?.code === "22023" || error?.code === "23514" || error?.code === "22001") return jsonError("Check your estimate and try again.", 400);
  if (error) return jsonError(FAILED[action], 500);
  return NextResponse.json({ ok: true });
}
