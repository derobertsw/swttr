import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { jsonError, readJson } from "@/lib/api";
import { STAY_COST_CURRENCIES } from "@/lib/stay-costs";
import { parseTripLocation } from "@/lib/trip-location";
import { dateLabel, dates, isCalendarDate, isUuid, nightsLabel, shiftDate } from "@/lib/trip-lodging";
import { requireTripAccess } from "@/lib/trips";
import type { Trip, TripLocation, TripStayCandidate, TripStayCandidateInput, TripStayCandidates } from "@/types/trips";

/**
 * Stays the organizer is considering (#213): separate from the trip's stays
 * and nights, so saving, editing or removing one never changes who's staying
 * where. See docs/trip-stays.md#comparing-stays-213.
 */

type Failure = { error: string; field: string };
const MISSING = ["42P01", "PGRST205"];
const MAX_COST = 10_000_000;

/** Checks an option sent by the browser, as the table's constraints do, keeping only the known fields. */
export function parseCandidate(value: unknown): TripStayCandidateInput | Failure {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "Enter a name for the stay.", field: "name" };
  const input = value as Record<string, unknown>;
  if (!isUuid(input.id)) return { error: "Invalid option identity. Reopen the editor.", field: "name" };
  const text = (key: string, max: number) => input[key] == null || input[key] === "" ? null
    : typeof input[key] === "string" && input[key].trim().length <= max ? input[key].trim() || null : undefined;
  const name = text("name", 200);
  if (!name) return { error: "Stay name must be 1–200 characters.", field: "name" };
  const checkIn = input.check_in === "" ? null : input.check_in ?? null, checkOut = input.check_out === "" ? null : input.check_out ?? null;
  if (checkIn !== null || checkOut !== null) {
    if (!isCalendarDate(checkIn)) return { error: "Choose a valid first night, or clear both dates.", field: "check_in" };
    if (!isCalendarDate(checkOut) || checkOut <= checkIn) return { error: "Check-out must be after check-in. Clear both dates to save without them.", field: "check_out" };
    if ((Date.parse(checkOut) - Date.parse(checkIn)) / 86400000 > 366) return { error: "Choose up to 366 nights.", field: "check_out" };
  }
  const address = text("address", 1000), url = text("property_url", 2000), notes = text("notes", 2000);
  if (address === undefined) return { error: "Keep the address to 1,000 characters.", field: "address" };
  if (url === undefined) return { error: "Keep the link to 2,000 characters.", field: "property_url" };
  if (notes === undefined) return { error: "Keep the notes to 2,000 characters.", field: "notes" };
  if (url) {
    try { const parsed = new URL(url); if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error(); }
    catch { return { error: "Use a complete http or https property link.", field: "property_url" }; }
  }
  let location: TripLocation | null = null;
  if (input.location != null) {
    const parsed = parseTripLocation(input.location);
    if ("error" in parsed) return { error: parsed.error, field: "location" };
    location = parsed;
  }
  // A cost is the organizer's estimate of the total, in one currency, for the option's nights.
  let amount: number | null = null;
  const rawAmount = typeof input.cost_amount === "string" ? input.cost_amount.trim().replaceAll(",", "") : input.cost_amount;
  if (rawAmount != null && rawAmount !== "") {
    const valid = (typeof rawAmount === "number" && Number.isFinite(rawAmount)) || (typeof rawAmount === "string" && /^\d+(\.\d{1,2})?$/.test(rawAmount));
    const parsed = valid ? Number(rawAmount) : NaN;
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_COST || Math.round(parsed * 100) !== Number((parsed * 100).toFixed(6))) {
      return { error: "Enter the estimated total as a number, like 840 or 840.50.", field: "cost_amount" };
    }
    amount = Math.round(parsed * 100) / 100;
  }
  const currency = input.cost_currency == null || input.cost_currency === "" ? null : input.cost_currency;
  // Without an amount the currency means nothing, so it isn't kept.
  if (amount !== null && !(STAY_COST_CURRENCIES as readonly unknown[]).includes(currency)) return { error: "Choose the currency of the estimate.", field: "cost_currency" };
  if (amount !== null && !checkIn) return { error: "Add the nights this cost covers, or clear the cost.", field: "check_in" };
  return {
    id: input.id.toLowerCase(), name, check_in: checkIn as string | null, check_out: checkOut as string | null,
    address: address ?? null, property_url: url ?? null, notes: notes ?? null, location,
    cost_amount: amount, cost_currency: amount === null ? null : currency as string,
  };
}

/** "$840", "CA$1,200.50": the amount as entered, in its own currency. */
function costText(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: Number.isInteger(amount) ? 0 : 2 }).format(amount);
}

type CandidateRow = Omit<TripStayCandidate, "date_label" | "cost_label" | "review_dates">;

/** An option as the app shows it, with its labels worked out here. */
export function summarizeCandidate(trip: Pick<Trip, "start_date" | "end_date">, row: CandidateRow): TripStayCandidate {
  const nights = dates(row.check_in, row.check_out);
  const date_label = nights.length ? nightsLabel(row.check_in!, nights.length) : "Nights not set";
  const amount = row.cost_amount == null ? null : Number(row.cost_amount);
  return {
    id: row.id, trip_id: row.trip_id, name: row.name, check_in: row.check_in, check_out: row.check_out,
    address: row.address ?? null, property_url: row.property_url ?? null, notes: row.notes ?? null, location: row.location ?? null,
    cost_amount: amount, cost_currency: amount === null ? null : row.cost_currency,
    revision: row.revision, created_at: row.created_at, updated_at: row.updated_at, date_label,
    cost_label: amount !== null && row.cost_currency && nights.length ? `About ${costText(amount, row.cost_currency)} total for ${date_label}` : null,
    review_dates: nights.filter((date) => date < shiftDate(trip.start_date, -1) || date > trip.end_date),
  };
}

/** The trip's options, oldest first; `available` is false before their migration. */
export async function loadStayCandidates(supabase: SupabaseClient, trip: Trip): Promise<{ available: boolean; candidates: TripStayCandidate[] }> {
  const { data, error } = await supabase.from("trip_stay_candidates").select("*").eq("trip_id", trip.id).order("created_at").order("id");
  if (error && MISSING.includes(error.code)) return { available: false, candidates: [] };
  if (error) throw new Error("Couldn't load stay options. Try again.");
  return { available: true, candidates: ((data ?? []) as CandidateRow[]).map((row) => summarizeCandidate(trip, row)) };
}

/**
 * The nights a comparison can cover: from the pre-trip night through the last
 * night, ending on any morning after the first. By default the trip's own
 * nights, from the first day to the last day's morning.
 */
export function stayWindowChoices(trip: Pick<Trip, "start_date" | "end_date">): Omit<TripStayCandidates, "available" | "candidates"> {
  const preTrip = shiftDate(trip.start_date, -1), afterLast = shiftDate(trip.end_date, 1);
  const nights = dates(preTrip, afterLast);
  return {
    first_nights: nights.map((date) => ({ date, label: date === preTrip ? `Night before the trip · ${dateLabel(date)}`
      : `Night of ${dateLabel(date)}${date === trip.end_date ? " · Last night" : ""}` })),
    checkouts: nights.map((night) => {
      const morning = shiftDate(night, 1);
      return { date: morning, label: `Morning of ${dateLabel(morning)}${morning === afterLast ? " · after the last night" : ""}` };
    }),
    default_window: trip.start_date === trip.end_date ? { first_night: preTrip, checkout: trip.start_date } : { first_night: trip.start_date, checkout: trip.end_date },
  };
}

const unavailable = () => jsonError("Stay options can't be saved yet. You can still compare saved stays.", 503);

/** The saved option as it is now, for the editor's review after a conflict. */
async function currentCandidate(supabase: SupabaseClient, trip: Trip, id: string): Promise<TripStayCandidate | null> {
  const { data } = await supabase.from("trip_stay_candidates").select("*").eq("trip_id", trip.id).eq("id", id).maybeSingle();
  return data ? summarizeCandidate(trip, data as CandidateRow) : null;
}

/**
 * Saves (`POST`, `PATCH`) or removes (`DELETE`) an option through
 * mutate_trip_stay_candidate, which checks the organizer and the revision the
 * editor opened. Organizer only; nothing here touches stays or nights.
 */
export async function handleCandidate(request: Request, tripId: string, options: { action: "save" | "remove"; candidateId?: string }) {
  const auth = await requireTripAccess(tripId, { organizerOnly: true });
  if (auth instanceof NextResponse) return auth;
  const body = await readJson(request);
  if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError("Invalid request.", 400);
  const expected = body.expected_revision ?? null;
  const editing = options.action === "remove" || !!options.candidateId;
  if (editing ? !Number.isSafeInteger(expected) || (expected as number) < 1 : expected !== null) {
    return jsonError("Reload the stay options before editing.", 400);
  }
  let payload: Record<string, unknown>;
  if (options.action === "save") {
    const candidate = parseCandidate({ ...(body.candidate && typeof body.candidate === "object" ? body.candidate : {}), ...(options.candidateId ? { id: options.candidateId } : {}) });
    if ("error" in candidate) return NextResponse.json(candidate, { status: 400 });
    payload = { ...candidate, expected_revision: expected };
  } else {
    if (!isUuid(options.candidateId)) return jsonError("Option not found in this trip.", 404);
    payload = { id: options.candidateId.toLowerCase(), expected_revision: expected };
  }
  const { data, error } = await auth.supabase.rpc("mutate_trip_stay_candidate", {
    p_trip_id: tripId, p_user_id: auth.userId, p_action: options.action, p_payload: payload,
  });
  if (error) {
    if (["PGRST202", "42883", ...MISSING].includes(error.code)) return unavailable();
    if (["PT409", "40001"].includes(error.code)) {
      const current = await currentCandidate(auth.supabase, auth.trip, payload.id as string).catch(() => null);
      return NextResponse.json({ error: "This option changed since you opened it. Review the saved option, then save again.", current }, { status: 409 });
    }
    if (error.code === "P0002") return jsonError("This option was removed. Your changes are still here; save them as a new option.", 404);
    if (error.code === "23505") return NextResponse.json({ error: "This place is already an option for these nights.", field: "name" }, { status: 409 });
    if (error.code === "22023" && error.hint === "limit") return jsonError("A trip can have up to 30 options. Remove one first.", 400);
    if (error.code === "42501") return jsonError("Organizer only", 403);
    return jsonError(options.action === "save" ? "Couldn't save the option. Your changes are still here; try again." : "Couldn't remove the option. Try again.", 500);
  }
  if (options.action === "remove") return NextResponse.json({ id: payload.id, removed: true });
  return NextResponse.json({ candidate: summarizeCandidate(auth.trip, data as CandidateRow) });
}

/** GET: the trip's options and the nights a comparison can cover. Anyone on the trip reads them. */
export async function listCandidates(tripId: string) {
  const auth = await requireTripAccess(tripId);
  if (auth instanceof NextResponse) return auth;
  try {
    const { available, candidates } = await loadStayCandidates(auth.supabase, auth.trip);
    const response: TripStayCandidates = { available, candidates, ...stayWindowChoices(auth.trip) };
    return NextResponse.json(response);
  } catch {
    return jsonError("Couldn't load stay options. Try again.", 500);
  }
}
