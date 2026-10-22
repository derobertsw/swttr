import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { jsonError, readJson } from "@/lib/api";
import { requireTripAccess } from "@/lib/trips";
import { buildLodging, isCalendarDate, isUuid, loadLodgingMembers, loadLodgingRows, parseStay, previewCrewLodging, shiftDate } from "@/lib/trip-lodging";
import { applyLodgingChange, lodgingPayload, parseAssignments, parseAttendance, parseOccupants, previewLodgingChange, type LodgingChange, type LodgingFailure } from "@/lib/trip-lodging-changes";
import type { Trip, TripLodgingAction } from "@/types/trips";

type Options = { action: TripLodgingAction; stayId?: string; date?: string; memberId?: string; preview?: boolean };
type Body = Record<string, unknown>;

const failure = ({ error, field, status }: LodgingFailure) => NextResponse.json({ error, ...(field ? { field } : {}) }, { status });
const changed = () => jsonError("The lodging plan changed. Review the saved plan before retrying.", 409);
// Before migration 20261021201500 there's nowhere to save a person's own nights.
const unavailable = () => jsonError("Per-person lodging can't be saved yet. Plan nights for the whole crew for now.", 503);

function parseChange(body: Body, options: Options, trip: Trip): LodgingChange | LodgingFailure {
  const { action } = options;
  if (action === "save") {
    const stay = parseStay({ ...(body.stay && typeof body.stay === "object" ? body.stay : {}), ...(options.stayId ? { id: options.stayId } : {}) });
    if ("error" in stay) return { ...stay, status: 400 };
    const occupants = parseOccupants(body.occupants);
    if (occupants && "error" in occupants) return occupants;
    // A preview names the stay in its body; a save's route says whether it's a new one.
    return { action, stay, existing: options.preview ? body.existing === true : !!options.stayId, ...(occupants ? { occupants } : {}) };
  }
  if (action === "remove") {
    const stayId = options.stayId ?? body.stay_id;
    return isUuid(stayId) ? { action, id: stayId } : { error: "Invalid stay identity.", status: 400 };
  }
  if (action === "night") {
    const date = options.date ?? body.date;
    if (!isCalendarDate(date) || date < shiftDate(trip.start_date, -1) || date > trip.end_date) return { error: "Choose a night within this itinerary or its pre-trip night.", status: 400 };
    if (body.status !== "no_stay" && body.status !== "unplanned") return { error: "Choose No stay needed or Not planned yet.", status: 400 };
    return { action, date, status: body.status };
  }
  if (action === "assign") {
    const assignments = parseAssignments(body.assignments);
    return "error" in assignments ? assignments : { action, assignments };
  }
  const memberId = options.memberId ?? body.member_id;
  if (!isUuid(memberId)) return { error: "Person not found in this trip.", status: 404 };
  const attendance = parseAttendance(body.attendance);
  return "error" in attendance ? attendance : { action, member_id: memberId.toLowerCase(), attendance };
}

const perPersonOnly = (change: LodgingChange) => change.action === "assign" || change.action === "attendance" || (change.action === "save" && change.occupants !== undefined);

/** The saved kits of the person whose attendance changes, by date; they're kept whatever the change. */
async function kitsFor(supabase: SupabaseClient, trip: Trip, memberId: string) {
  const [days, kits] = await Promise.all([
    supabase.from("trip_days").select("id, date").eq("trip_id", trip.id),
    supabase.from("trip_member_day_kits").select("trip_day_id").eq("trip_member_id", memberId),
  ]);
  if (days.error || kits.error) throw new Error("Couldn't load saved kits");
  const dateOf = new Map((days.data ?? []).map((day) => [day.id as string, day.date as string]));
  return (kits.data ?? []).flatMap((kit) => dateOf.has(kit.trip_day_id) ? [{ member_id: memberId, date: dateOf.get(kit.trip_day_id)! }] : []);
}

/**
 * Stay, night, per-person night and attendance previews and saves (#207,
 * #331). Every write goes through mutate_trip_lodging, which checks the
 * organizer, revision, crew and replay identity before anything else.
 */
export async function handleLodging(request: Request, tripId: string, options: Options) {
  const auth = await requireTripAccess(tripId, { organizerOnly: true });
  if (auth instanceof NextResponse) return auth;
  const body = await readJson(request);
  if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError("Invalid request.", 400);
  const change = parseChange(body, options, auth.trip);
  if ("error" in change) return failure(change);
  if (!Number.isSafeInteger(body.expected_revision) || (body.expected_revision as number) < 0) return jsonError("Reload the saved lodging plan before editing.", 400);
  const peopleKey = body.expected_people_key;
  if (peopleKey !== undefined && (typeof peopleKey !== "string" || !/^[0-9a-f]{32}$/.test(peopleKey))) return jsonError("Reload the saved lodging plan before editing.", 400);

  if (options.preview) {
    try {
      const [rows, members] = await Promise.all([loadLodgingRows(auth.supabase, tripId), loadLodgingMembers(auth.supabase, tripId)]);
      if (perPersonOnly(change) && !rows.per_member) return unavailable();
      const lodging = buildLodging(auth.trip, rows.stays, rows.assignments, { members, attendance: rows.attendance, per_member: rows.per_member });
      if (lodging.revision !== body.expected_revision || (peopleKey !== undefined && peopleKey !== lodging.people_key)) return changed();
      if (!rows.per_member) {
        if ((change.action === "remove" || (change.action === "save" && change.existing)) && !lodging.stays.some((stay) => stay.id === (change.action === "remove" ? change.id : change.stay.id))) {
          return jsonError("Stay not found in this trip.", 404);
        }
        const payload = change.action === "save" ? change.stay : change.action === "remove" ? { id: change.id } : lodgingPayload(change) as { date: string; status: string };
        return NextResponse.json(previewCrewLodging(auth.trip, lodging, change.action, payload));
      }
      const kits = change.action === "attendance" ? await kitsFor(auth.supabase, auth.trip, change.member_id) : [];
      const preview = previewLodgingChange(auth.trip, rows, members, change, kits);
      return "error" in preview ? failure(preview) : NextResponse.json(preview);
    } catch { return jsonError("Couldn't preview the nights. Try again.", 500); }
  }

  if (!isUuid(body.mutation_id)) return jsonError("Invalid save identity. Reopen the editor.", 400);
  if (body.replace_nights !== undefined && typeof body.replace_nights !== "boolean") return jsonError("Invalid night replacement choice.", 400);
  // Before migration 025 the transaction would drop the place and still succeed.
  if (change.action === "save" && change.stay.location) {
    const { error: missing } = await auth.supabase.from("trip_stays").select("location").limit(1);
    if (missing?.code === "42703") {
      return NextResponse.json({ error: "Stay locations can't be saved yet. Remove the location to save the stay now.", field: "location" }, { status: 503 });
    }
  }
  // The earlier transaction would reject these as a reused save identity.
  if (perPersonOnly(change)) {
    const { error: missing } = await auth.supabase.from("trip_member_lodging_nights").select("member_id").eq("trip_id", tripId).limit(1);
    if (missing && ["42P01", "PGRST205"].includes(missing.code)) return unavailable();
  }
  // Nothing else is checked against the saved plan here: a retried save must
  // reach the transaction to get its first result back.
  const { data, error } = await auth.supabase.rpc("mutate_trip_lodging", {
    p_trip_id: tripId, p_user_id: auth.userId, p_expected_revision: body.expected_revision,
    p_request_id: body.mutation_id, p_action: change.action,
    p_payload: { ...lodgingPayload(change), ...(peopleKey !== undefined ? { people_key: peopleKey } : {}) },
    p_replace_nights: body.replace_nights === true,
  });
  if (error) {
    if (["40001", "PT409"].includes(error.code)) return changed();
    if (error.code === "23P01") return jsonError("These nights already have a plan. Review and explicitly replace those nights, or change dates.", 409);
    if (["42501", "P0002"].includes(error.code)) return jsonError(error.hint === "member" ? "Person not found in this trip." : "Stay not found in this trip.", 404);
    if (error.code === "22023" && error.hint) return explainRejection(auth.supabase, auth.trip, change);
    if (error.code === "22023") return jsonError("This save identity was already used. Reopen the editor.", 409);
    if (error.code === "23505") return jsonError("A stay with this name, address and dates is already saved. Review the existing stay.", 409);
    return jsonError("Couldn't save lodging. Your changes are still here; try again.", 500);
  }
  return NextResponse.json(data);
}

/** Why the transaction rejected a change's nights or dates, worked out against the saved plan. */
async function explainRejection(supabase: SupabaseClient, trip: Trip, change: LodgingChange) {
  const generic = jsonError("These nights or dates can't be planned as entered. Review them and try again.", 400);
  try {
    const [rows, members] = await Promise.all([loadLodgingRows(supabase, trip.id), loadLodgingMembers(supabase, trip.id)]);
    const result = applyLodgingChange(trip, rows, members, change);
    return "error" in result ? failure(result) : generic;
  } catch { return generic; }
}
