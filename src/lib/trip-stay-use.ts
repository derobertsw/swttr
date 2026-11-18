import "server-only";
import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { buildLodging, CREW_STATUSES, dateLabel, dates, isUuid, loadLodgingMembers, loadLodgingRows } from "@/lib/trip-lodging";
import { handleLodging } from "@/lib/trip-lodging-api";
import { loadStayCandidates } from "@/lib/trip-stay-candidates";
import { parseStayWindow } from "@/lib/trip-stay-comparison";
import { requireTripAccess } from "@/lib/trips";
import type { TripLodgingAssignment, TripLodgingPerson, TripLodgingPreview, TripStayInput, TripStayUsePreview } from "@/types/trips";

const listed = (items: string[]) => items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

/**
 * Use for these nights (#213): puts the chosen people in a compared stay or
 * option for the compared nights. It's the same change, preview and save as
 * the Stays page's own: Change nights for a saved stay, and Add stay with
 * who's staying for an option, which becomes a stay with the option's id.
 * Bookings are never changed. An option is saved only as its preview showed it:
 * `expected_candidate_revision` is checked with the save (use_trip_stay_candidate),
 * or just before it until that function's migration is applied. See
 * docs/trip-stays.md#use-for-these-nights.
 *
 * Body: `{option, first_night, checkout, member_ids?}`, and to save,
 * `{expected_revision, expected_people_key, mutation_id, replace_nights?}`
 * from the preview, and `expected_candidate_revision` when it made a new stay
 * from an option. Without `member_ids` it's everyone on the trip those
 * nights: the crew, and anyone else already planned for one of them.
 */
export async function handleUseOption(request: Request, tripId: string, { preview }: { preview: boolean }) {
  const auth = await requireTripAccess(tripId, { organizerOnly: true });
  if (auth instanceof NextResponse) return auth;
  const body = await readJson(request);
  if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError("Invalid request.", 400);
  const window = parseStayWindow(body.first_night, body.checkout, auth.trip);
  if ("error" in window) return NextResponse.json(window, { status: 400 });
  const [kind, rawId] = String(body.option ?? "").split(":");
  if ((kind !== "stay" && kind !== "candidate") || !isUuid(rawId)) return jsonError("Stay not found in this trip.", 404);
  const id = rawId.toLowerCase();

  let rows: Awaited<ReturnType<typeof loadLodgingRows>>, members: Awaited<ReturnType<typeof loadLodgingMembers>>, candidates: Awaited<ReturnType<typeof loadStayCandidates>>["candidates"];
  try {
    [rows, members, { candidates }] = await Promise.all([loadLodgingRows(auth.supabase, tripId), loadLodgingMembers(auth.supabase, tripId), loadStayCandidates(auth.supabase, auth.trip)]);
  } catch {
    return jsonError("Couldn't load the stays. Try again.", 500);
  }
  if (!rows.per_member) return jsonError("Choosing a stay for these nights needs per-person nights. Plan the nights on Stays for now.", 503);
  // Saving an option as a new stay names the option's revision its preview showed.
  const expectedOption = preview ? null : body.expected_candidate_revision ?? null;
  if (expectedOption !== null && (kind !== "candidate" || !Number.isSafeInteger(expectedOption) || (expectedOption as number) < 1)) {
    return jsonError("Reload the comparison and review the nights again before saving.", 400);
  }
  const saved = rows.stays.find((entry) => entry.id === id);
  const option = kind === "candidate" ? candidates.find((entry) => entry.id === id) : undefined;
  if (expectedOption !== null && option?.revision !== expectedOption) {
    // Edited or removed since the preview, so it isn't the place that was reviewed. A
    // retried save of an unchanged option rebuilds the same change and gets its first result.
    return jsonError("This option changed since you reviewed it. Review it again.", 409);
  }
  // An option already used is the stay it became, except when saving it as previewed: a
  // retry, after the stay was created, must send the same change again.
  const stay = expectedOption === null ? saved : undefined;
  const candidate = stay ? undefined : option;
  if (!stay && !candidate) return jsonError(kind === "stay" ? "Stay not found in this trip." : "Option not found in this trip.", 404);
  if (!preview && candidate && expectedOption === null) return jsonError("Reload the comparison and review the nights again before saving.", 400);

  const lodging = buildLodging(auth.trip, rows.stays, rows.assignments, { members, attendance: rows.attendance, per_member: true });
  const nights = dates(window.first_night, window.checkout);
  const people = lodging.people.filter((person) => person.membership !== "left");
  const onTrip = (person: TripLodgingPerson, night: string) => person.nights.some((entry) => entry.date === night && entry.state !== "not_on_trip");
  const planned = (person: TripLodgingPerson, night: string) => rows.assignments.some((row) => row.member_id === person.member_id && row.date === night);

  let chosen: TripLodgingPerson[];
  if (body.member_ids === undefined) {
    chosen = people.filter((person) => nights.some((night) => onTrip(person, night) && (CREW_STATUSES.has(person.membership) || planned(person, night))));
  } else {
    const ids = body.member_ids;
    if (!Array.isArray(ids) || ids.length > 200 || !ids.every(isUuid) || new Set(ids.map((entry) => entry.toLowerCase())).size !== ids.length) {
      return NextResponse.json({ error: "Choose people from this trip.", field: "member_ids" }, { status: 400 });
    }
    const found = ids.map((entry) => people.find((person) => person.member_id === entry.toLowerCase()));
    if (found.some((person) => !person)) return jsonError("Person not found in this trip.", 404);
    chosen = found as TripLodgingPerson[];
  }
  const going = chosen.filter((person) => nights.some((night) => onTrip(person, night)));
  if (!going.length) return NextResponse.json({ error: "Choose who stays there these nights.", field: "member_ids" }, { status: 400 });

  let change: { action: "assign" | "save"; body: Record<string, unknown> };
  const name = stay?.name ?? candidate!.name;
  if (stay) {
    const missing = nights.filter((night) => !stay.check_in || night < stay.check_in || night >= stay.check_out!);
    if (missing.length) {
      return NextResponse.json({ error: `${stay.name}'s dates don't include ${missing.length === 1 ? "the night of" : "the nights of"} ${listed(missing.map(dateLabel))}. Change its dates on Stays first, or choose nights within them.`, field: "first_night" }, { status: 400 });
    }
    const assignments: TripLodgingAssignment[] = going.map((person) => ({ member_id: person.member_id, status: "assigned", stay_id: stay.id,
      dates: nights.filter((night) => onTrip(person, night)) }));
    change = { action: "assign", body: { assignments } };
  } else {
    const option = candidate!;
    const input: TripStayInput = { id: option.id, name: option.name, check_in: window.first_night, check_out: window.checkout, type: null,
      address: option.address, property_url: option.property_url, check_in_time: null, check_out_time: null, notes: option.notes,
      booking_status: "not_booked", location: option.location };
    change = { action: "save", body: { stay: input, existing: false, occupants: going.map((person) => person.member_id) } };
  }

  // A preview is read only, so it's of the plan as saved now; the save then names the plan that preview showed.
  const forwarded = new Request(request.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
    ...change.body,
    ...preview ? { expected_revision: lodging.revision, expected_people_key: lodging.people_key }
      : { expected_revision: body.expected_revision, expected_people_key: body.expected_people_key, mutation_id: body.mutation_id, replace_nights: body.replace_nights },
  }) });
  // The option is kept: it's listed with the stays from then on, and a retry rebuilds this change from it.
  const response = await handleLodging(forwarded, tripId, { action: change.action, preview,
    ...!preview && candidate ? { candidate: { id: candidate.id, revision: expectedOption as number } } : {} });
  if (!response.ok || !preview) return response;
  const result = await response.json() as TripLodgingPreview;
  // The booked stays the chosen people leave those nights: they stay booked.
  const leaving = new Set(going.flatMap((person) => nights.flatMap((night) => {
    const row = rows.assignments.find((saved) => saved.member_id === person.member_id && saved.date === night && saved.status === "assigned");
    return row?.stay_id && row.stay_id !== id ? [row.stay_id] : [];
  })));
  const usePreview: TripStayUsePreview = {
    ...result, member_ids: going.map((person) => person.member_id), stay_name: name, new_stay: !stay, candidate_revision: candidate?.revision ?? null,
    booked_kept: rows.stays.filter((saved) => leaving.has(saved.id) && saved.booking_status === "booked").map((saved) => saved.name),
  };
  return NextResponse.json(usePreview);
}
