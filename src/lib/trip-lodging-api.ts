import "server-only";
import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { requireTripAccess } from "@/lib/trips";
import { isCalendarDate, isUuid, loadLodging, parseStay, previewLodging, shiftDate } from "@/lib/trip-lodging";
import type { TripLodgingAction, TripStayInput } from "@/types/trips";

type Options = { action: TripLodgingAction; stayId?: string; date?: string; preview?: boolean };

export async function handleLodging(request: Request, tripId: string, options: Options) {
  const auth = await requireTripAccess(tripId, { organizerOnly: true });
  if (auth instanceof NextResponse) return auth;
  const body = await readJson(request);
  if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError("Invalid request.", 400);
  const action = options.action;
  let payload: TripStayInput | { id: string } | { date: string; status: string };
  if (action === "save") {
    const stay = parseStay({ ...(body.stay && typeof body.stay === "object" ? body.stay : {}), ...(options.stayId ? { id: options.stayId } : {}) });
    if ("error" in stay) return NextResponse.json(stay, { status: 400 });
    payload = stay;
  } else if (action === "remove") {
    const stayId = options.stayId ?? body.stay_id;
    if (!isUuid(stayId)) return jsonError("Invalid stay identity.", 400);
    payload = { id: stayId };
  } else {
    const date = options.date ?? body.date;
    if (!isCalendarDate(date) || date < shiftDate(auth.trip.start_date, -1) || date > auth.trip.end_date) return jsonError("Choose a night within this itinerary or its pre-trip night.", 400);
    if (body.status !== "no_stay" && body.status !== "unplanned") return jsonError("Choose No stay needed or Not planned yet.", 400);
    payload = { date, status: body.status };
  }
  if (!Number.isSafeInteger(body.expected_revision) || (body.expected_revision as number) < 0) return jsonError("Reload the saved lodging plan before editing.", 400);
  if (options.preview) {
    try {
      const lodging = await loadLodging(auth.supabase, auth.trip);
      if (lodging.revision !== body.expected_revision) return jsonError("The lodging plan changed. Review the saved plan before retrying.", 409);
      if ("id" in payload && (action === "remove" || body.existing === true) && !lodging.stays.some((stay) => stay.id === payload.id)) return jsonError("Stay not found in this trip.", 404);
      return NextResponse.json(previewLodging(auth.trip, lodging, action, payload));
    } catch { return jsonError("Couldn't preview the nights. Try again.", 500); }
  }
  if (!isUuid(body.mutation_id)) return jsonError("Invalid save identity. Reopen the editor.", 400);
  if (body.replace_nights !== undefined && typeof body.replace_nights !== "boolean") return jsonError("Invalid night replacement choice.", 400);
  const { data, error } = await auth.supabase.rpc("mutate_trip_lodging", {
    p_trip_id: tripId, p_user_id: auth.userId, p_expected_revision: body.expected_revision,
    p_request_id: body.mutation_id, p_action: action,
    p_payload: { ...payload, ...(action === "save" ? { existing: !!options.stayId } : {}) },
    p_replace_nights: body.replace_nights === true,
  });
  if (error) {
    if (error.code === "40001") return jsonError("The lodging plan changed. Review the saved plan before retrying.", 409);
    if (error.code === "23P01") return jsonError("These nights already have a plan. Review and explicitly replace those nights, or change dates.", 409);
    if (["42501", "P0002"].includes(error.code)) return jsonError("Stay not found in this trip.", 404);
    if (error.code === "22023") return jsonError("This save identity was already used. Reopen the editor.", 409);
    if (error.code === "23505") return jsonError("A stay with this name, address and dates is already saved. Review the existing stay.", 409);
    return jsonError("Couldn't save lodging. Your changes are still here; try again.", 500);
  }
  return NextResponse.json(data);
}
