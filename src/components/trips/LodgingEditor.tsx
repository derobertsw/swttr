"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input, fieldClassName } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { TripSheet, TripSheetDescription, TripSheetTitle } from "@/components/trips/TripSheet";
import { LocationPicker } from "@/components/trips/LocationPicker";
import { useTripEditorHistory } from "@/hooks/useTripEditorHistory";
import { errorMessage, timedTripRequest as lodgingRequest, TripRequestError } from "@/lib/trip-requests";
import type { TripFull, TripLodgingAction, TripLodgingPerson, TripLodgingPreview, TripStayInput, TripStaySummary } from "@/types/trips";

/**
 * What to edit: a stay, a crew night (before per-person nights), some
 * people's nights, or one person's dates on the trip (#331, #332).
 */
export type LodgingEditorTarget = {
  action: TripLodgingAction; stay?: TripStaySummary; date?: string; focus?: string;
  /** For "assign": who and which nights start selected. */
  memberIds?: string[]; dates?: string[];
  /** For "attendance". */
  memberId?: string;
};

export const STAY_EXACT = "the exact property";
const blankStay = (): TripStayInput => ({ id: crypto.randomUUID(), name: "", check_in: null, check_out: null, type: null, address: null, property_url: null, check_in_time: null, check_out_time: null, notes: null, booking_status: "not_booked", location: null });
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id));
const CREW = new Set(["joined", "guest"]);

/** "Alex's", or "Your" for the organizer, whom the trip API names "You" to themself. */
export const possessive = (name: string) => name === "You" ? "Your" : `${name}'s`;

/** A person's membership and dates, as the editor and the Stays views show them. */
export function personNote(person: TripLodgingPerson) {
  return [person.membership === "invited" && "Invitation pending", person.membership === "guest" && "Managed guest",
    person.attendance.label !== "Whole trip" && person.attendance.label].filter(Boolean).join(" · ");
}

/** Focuses a field the server rejected or the opener asked for; a group of checkboxes focuses its first. */
function focusField(form: HTMLFormElement | null, name: string) {
  const field = form?.elements.namedItem(name);
  const target = field instanceof RadioNodeList ? field[0] : field;
  if (!(target instanceof HTMLElement)) return false;
  const details = target.closest("details");
  if (details) details.open = true;
  target.focus();
  return true;
}

const SAVED_MESSAGE: Record<TripLodgingAction, string> = { save: "Stay saved.", remove: "Stay removed from trip.", night: "Night plan saved.", assign: "Nights saved.", attendance: "Trip dates saved." };

export function LodgingEditor({ editor: opened, data, onClose, onSaved, onCloseAutoFocus }: {
  editor: LodgingEditorTarget; data: TripFull; onClose: () => void; onSaved: (message: string) => Promise<void>; onCloseAutoFocus: (event: Event) => void;
}) {
  // "Not on the trip those nights?" turns a nights editor into that person's dates, in the same sheet.
  const [editor, setEditor] = useState(opened);
  const perMember = !!data.lodging?.per_member;
  const people = (data.lodging?.people ?? []).filter((person) => person.membership !== "left");
  const nights = data.lodging?.nights ?? [];
  const nightLabel = (date: string) => nights.find((night) => night.date === date)?.date_label ?? date;
  const [stay, setStay] = useState<TripStayInput>(() => editor.stay ? {
    id: editor.stay.id, name: editor.stay.name, check_in: editor.stay.check_in, check_out: editor.stay.check_out,
    type: editor.stay.type, address: editor.stay.address, property_url: editor.stay.property_url,
    check_in_time: editor.stay.check_in_time?.slice(0, 5) ?? null, check_out_time: editor.stay.check_out_time?.slice(0, 5) ?? null,
    notes: editor.stay.notes, booking_status: editor.stay.booking_status, location: editor.stay.location ?? null,
  } : blankStay());
  const [original] = useState(() => JSON.stringify(stay));
  // A new stay starts with the crew while nobody is staying anywhere yet, and with nobody once someone is.
  const [initialOccupants] = useState(() => editor.stay ? editor.stay.occupants.map((occupant) => occupant.member_id)
    : data.lodging?.stays.some((saved) => saved.occupants.length) ? [] : people.filter((person) => CREW.has(person.membership)).map((person) => person.member_id));
  const [occupants, setOccupants] = useState(initialOccupants);
  const [who, setWho] = useState(editor.memberIds ?? []);
  const [chosenNights, setChosenNights] = useState(editor.dates ?? []);
  const [plan, setPlan] = useState("");
  const attendee = people.find((person) => person.member_id === editor.memberId);
  const initialAttendance = { arrival_date: attendee?.attendance.arrival_date ?? "", departure_date: attendee?.attendance.departure_date ?? "", skipped_dates: attendee?.attendance.skipped_dates ?? [] };
  const [attendance, setAttendance] = useState(initialAttendance);
  const [revision, setRevision] = useState(data.lodging?.revision ?? 0);
  const [nightStatus, setNightStatus] = useState("");
  const occupantsChanged = !sameSet(occupants, initialOccupants);
  // A new stay always says who's in it; an edit only when that changed, so a notes edit never moves anyone.
  const sendOccupants = editor.action === "save" && perMember && (!editor.stay || occupantsChanged);
  const dirty = editor.action === "save" ? JSON.stringify(stay) !== original || occupantsChanged
    : editor.action === "night" ? nightStatus !== ""
    : editor.action === "assign" ? plan !== "" || !sameSet(who, opened.memberIds ?? []) || !sameSet(chosenNights, opened.dates ?? [])
    : editor.action === "attendance" && JSON.stringify(attendance) !== JSON.stringify(initialAttendance);
  const [preview, setPreview] = useState<TripLodgingPreview | null>(null);
  const [replacement, setReplacement] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [savedPlan, setSavedPlan] = useState<TripFull | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [closed, setClosed] = useState(false);
  const mutationId = useRef<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const reviewRef = useRef<HTMLHeadingElement>(null);
  const handleBack = () => {
    if (busy) return true;
    if (dirty) { setDiscarding(true); return true; }
    setClosed(true);
    return false;
  };
  const history = useTripEditorHistory(handleBack, dirty && !closed);
  const close = () => { history.leave(); setClosed(true); };
  const requestClose = () => {
    if (handleBack()) history.ensureEntry();
    else history.leave();
  };
  const reset = () => { setPreview(null); setErrorField(null); setError(null); setReplacement(false); };
  const update = (patch: Partial<TripStayInput>) => { setStay((prev) => ({ ...prev, ...patch })); reset(); };
  const change = (field: keyof TripStayInput, value: string) => update({ [field]: field === "name" ? value : value || null });
  // Keeps what was typed in the address so the place can be confirmed later.
  const saveLocationLater = (query: string) => {
    if (!stay.address?.trim()) update({ address: query });
    setTimeout(() => (form.current?.elements.namedItem("address") as HTMLElement | null)?.focus(), 0);
  };
  // Each selected person's chosen nights they're on the trip; the others are left as they are.
  const lodging = savedPlan?.lodging ?? data.lodging;
  const assignments = () => who.flatMap((memberId) => {
    const person = lodging?.people.find((candidate) => candidate.member_id === memberId);
    const dates = chosenNights.filter((date) => person?.nights.find((night) => night.date === date)?.state !== "not_on_trip").sort();
    if (!dates.length) return [];
    const stayId = plan.startsWith("stay:") ? plan.slice(5) : null;
    return [{ member_id: memberId, status: stayId ? "assigned" : plan, ...(stayId ? { stay_id: stayId } : {}), dates }];
  });
  const requestBody = () => {
    const common = { action: editor.action, expected_revision: revision };
    switch (editor.action) {
      case "save": return { ...common, stay, existing: !!editor.stay, ...(sendOccupants ? { occupants } : {}) };
      case "remove": return { ...common, stay_id: editor.stay?.id };
      case "night": return { ...common, date: editor.date, status: nightStatus };
      case "assign": return { ...common, assignments: assignments() };
      case "attendance": return { ...common, member_id: editor.memberId, attendance: { arrival_date: attendance.arrival_date || null, departure_date: attendance.departure_date || null, skipped_dates: attendance.skipped_dates } };
    }
  };
  const showError = (err: unknown) => {
    setError(errorMessage(err));
    setConflict(err instanceof TripRequestError && err.status === 409);
    const field = err instanceof TripRequestError && typeof err.details?.field === "string" ? err.details.field : null;
    setErrorField(field);
  };
  useEffect(() => {
    if (busy || !errorField) return;
    focusField(form.current, errorField);
  }, [busy, errorField]);
  // What has to be chosen before a nights preview: the server would only say "Choose who and which nights to plan".
  const missing = () => editor.action !== "assign" ? null : !who.length ? ["who", "Choose who to plan nights for."]
    : !chosenNights.length ? ["nights", "Choose at least one night."] : !plan ? ["plan", "Choose a stay, No accommodation needed or Not planned."]
    : !assignments().length ? ["nights", "Nobody you chose is on the trip those nights. Change their trip dates first."] : null;
  const prepare = async (event?: FormEvent) => {
    event?.preventDefault();
    if (busy) return;
    const invalid = missing();
    if (invalid) { setError(invalid[1]); setConflict(false); setErrorField(invalid[0]); return; }
    setBusy(true); setError(null); setErrorField(null);
    try {
      const result = await lodgingRequest<TripLodgingPreview>(`/api/v1/trips/${data.trip.id}/stays/preview`, "POST", requestBody());
      setPreview(result); setReplacement(false); mutationId.current = crypto.randomUUID();
      setTimeout(() => reviewRef.current?.focus(), 0);
    } catch (err) { showError(err); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (busy || !preview || !mutationId.current) return;
    setBusy(true); setError(null);
    const base = `/api/v1/trips/${data.trip.id}`;
    const routes: Record<TripLodgingAction, [string, "POST" | "PATCH" | "PUT" | "DELETE"]> = {
      save: [`${base}/stays${editor.stay ? `/${editor.stay.id}` : ""}`, editor.stay ? "PATCH" : "POST"],
      remove: [`${base}/stays/${editor.stay?.id}`, "DELETE"],
      night: [`${base}/lodging-nights/${editor.date}`, "PUT"],
      assign: [`${base}/lodging-assignments`, "PUT"],
      attendance: [`${base}/members/${editor.memberId}/attendance`, "PUT"],
    };
    const target = routes[editor.action];
    try {
      await lodgingRequest(target[0], target[1], { ...requestBody(), mutation_id: mutationId.current, replace_nights: replacement, expected_people_key: preview.people_key });
      await onSaved(editor.action === "attendance" && attendee ? `${possessive(attendee.display_name)} trip dates saved.` : SAVED_MESSAGE[editor.action]); close();
    } catch (err) { showError(err); }
    finally { setBusy(false); }
  };
  const inspect = async () => {
    setBusy(true); setError(null);
    try {
      const current = await lodgingRequest<TripFull>(`/api/v1/trips/${data.trip.id}`, "GET");
      setSavedPlan(current); setRevision(current.lodging?.revision ?? 0); setPreview(null); setConflict(false);
    } catch (err) { showError(err); }
    finally { setBusy(false); }
  };
  const switchToAttendance = (memberId: string) => {
    setEditor({ action: "attendance", memberId }); reset(); setConflict(false);
    const person = people.find((candidate) => candidate.member_id === memberId);
    setAttendance({ arrival_date: person?.attendance.arrival_date ?? "", departure_date: person?.attendance.departure_date ?? "", skipped_dates: person?.attendance.skipped_dates ?? [] });
  };
  const input = (field: Exclude<keyof TripStayInput, "location">, label: string, type = "text", required = false, maxLength?: number) => <label className="block min-w-0 space-y-1 text-base text-foreground">
    <span>{label}</span><Input name={field} type={type} required={required} maxLength={maxLength} value={stay[field] ?? ""} onChange={(event) => change(field, event.target.value)}
      className={fieldClassName} aria-invalid={errorField === field || undefined} aria-describedby={errorField === field ? "stay-error" : undefined} />
  </label>;
  const conflictDates = preview?.conflicts.map((date) => preview.changes.find((entry) => entry.date === date)?.date_label ?? preview.nights.find((night) => night.date === date)?.date_label ?? nightLabel(date)).join(", ");
  const title = discarding ? "Discard changes?" : editor.action === "remove" ? "Remove from trip" : editor.action === "night" ? "Change crew night"
    : editor.action === "assign" ? "Change nights" : editor.action === "attendance" ? (attendee ? `${possessive(attendee.display_name)} trip dates` : "Trip dates") : editor.stay ? "Change stay" : "Add stay";
  const description = discarding ? "Your saved plan will be kept." : editor.action === "assign" ? "Only the people and nights you choose change."
    : editor.action === "attendance" ? "Dates on the trip never change membership, saved outfits or reviews." : "Crew stay · Managed by the organizer";
  const saveLabel = editor.action === "remove" ? "Remove from trip" : replacement ? "Replace those nights and save" : editor.action === "night" ? "Save night plan"
    : editor.action === "assign" ? "Save nights" : editor.action === "attendance" ? "Save trip dates" : "Save stay";
  return <TripSheet open={!closed} busy={busy} onClose={requestClose} className="sm:max-w-xl" fullHeight={editor.action === "save"}
    onCloseAutoFocus={(event) => { onCloseAutoFocus(event); onClose(); }}
    onOpenAutoFocus={editor.focus ? (event) => { if (focusField(form.current, editor.focus!)) event.preventDefault(); } : undefined}
    header={<><TripSheetTitle>{title}</TripSheetTitle><TripSheetDescription>{description}</TripSheetDescription></>}
    footer={discarding ? <><Button type="button" onClick={(event) => { event.preventDefault(); setDiscarding(false); history.ensureEntry(); }}>Keep editing</Button><Button type="button" variant="outline" onClick={close}>Discard changes</Button></> : <>
      {conflict ? <Button type="button" loading={busy} onClick={inspect}>Review saved plan</Button> : preview ? <Button type="button" loading={busy} disabled={preview.conflicts.length > 0 && !replacement} onClick={save}>{saveLabel}</Button>
        : <Button type="submit" form="stay-form" loading={busy}>Review {editor.action === "remove" ? "removal" : "nights"}</Button>}
      <Button type="button" variant="outline" disabled={busy} onClick={requestClose}>Cancel</Button>
    </>}
  >
    {!discarding && <div className="space-y-4">
      {savedPlan && <div className="rounded-control border border-warning p-3 text-base text-foreground">
        <p>The saved plan is shown below. Your pending changes are kept; review nights again before saving.</p>
        {savedPlan.lodging?.stays.map((saved) => <p key={saved.id} className="mt-2 break-words">{saved.name} · {saved.date_label} · {saved.booking_status === "booked" ? "Booked" : "Not booked"}{saved.notes ? ` · ${saved.notes}` : ""}</p>)}
        {!savedPlan.lodging?.stays.length && <p>No stays saved.</p>}
        {savedPlan.lodging?.people.filter((person) => (editor.action === "attendance" ? [editor.memberId] : who).includes(person.member_id)).map((person) =>
          <p key={person.member_id} className="mt-2 break-words">{person.display_name}: {person.runs.filter((run) => run.state !== "not_on_trip").map((run) => `${run.label} ${run.date_label}`).join("; ") || "Not on trip"}</p>)}
      </div>}
      {error && <p id="stay-error" role="alert" className="text-base text-destructive">{error}</p>}
      <form id="stay-form" ref={form} onSubmit={prepare} className="space-y-4" aria-busy={busy}>
        <fieldset disabled={busy} className="min-w-0 space-y-4">
          {editor.action === "save" ? <>
            {input("name", "Stay name", "text", true, 200)}
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">{input("check_in", "Check-in", "date")}{input("check_out", "Check-out", "date")}</div>
            <p className="text-base text-muted-foreground">Dates are optional. Check-out morning is included as a starting point, not another night.</p>
            {perMember && <Group legend="Who is staying here?" invalid={errorField === "occupants"}>
              <p className="text-base text-muted-foreground">{stay.check_in ? "They stay here every night of these dates they're on the trip. To change single nights, use Change nights." : "Add check-in and check-out to choose who stays here."}</p>
              <PeopleChecklist name="occupants" people={people} selected={occupants} disabled={!stay.check_in} onChange={(next) => { setOccupants(next); reset(); }} />
            </Group>}
            <LocationPicker tripId={data.trip.id} heading="Where is the stay?" exactTarget={STAY_EXACT} value={stay.location ?? null}
              initialQuery={editor.focus === "location" ? stay.address ?? "" : ""} onChange={(location) => update({ location })} onSaveLater={saveLocationLater} />
            {input("address", "Address or location description", "text", false, 1000)}
            <label className="block space-y-1 text-base text-foreground"><span>Booking status</span><select name="booking_status" value={stay.booking_status} onChange={(event) => change("booking_status", event.target.value)} className={fieldClassName}><option value="not_booked">Not booked</option><option value="booked">Booked</option></select></label>
            <details className="text-base text-foreground"><summary className="min-h-11 cursor-pointer py-2">More details (optional)</summary>
              <div className="space-y-3">
                <label className="block space-y-1"><span>Stay type</span><select name="type" value={stay.type ?? ""} onChange={(event) => change("type", event.target.value)} className={fieldClassName}><option value="">Not set</option>{["hotel", "rental", "hut", "campground", "other"].map((type) => <option key={type} value={type}>{type[0].toUpperCase() + type.slice(1)}</option>)}</select></label>
                {input("property_url", "Property website", "url", false, 2000)}
                {input("check_in_time", "Check-in time (property local time)", "time")}{input("check_out_time", "Check-out time (property local time)", "time")}
                <label className="block space-y-1"><span>Notes shared with the crew</span><textarea name="notes" rows={3} maxLength={4000} className={cn(fieldClassName, "h-auto py-2")} value={stay.notes ?? ""} onChange={(event) => change("notes", event.target.value)} aria-invalid={errorField === "notes" || undefined} /></label>
                <p className="text-base text-muted-foreground">Leave out confirmation numbers, payment details and access codes.</p>
              </div>
            </details>
          </> : editor.action === "remove" ? <><p className="break-words text-base text-foreground">{editor.stay?.name}</p><p className="text-base text-foreground">Removing this stay from the trip does not cancel your booking. {perMember ? "Everyone's nights there" : "Assigned nights"} will become Not planned yet.</p></>
          : editor.action === "assign" ? <>
            <Group legend="Who" invalid={errorField === "who"}>
              <PeopleChecklist name="who" people={people} selected={who} onChange={(next) => { setWho(next); reset(); }} />
            </Group>
            <Group legend="Which nights" invalid={errorField === "nights"}>
              {nights.map((night) => <Check key={night.date} name="nights" checked={chosenNights.includes(night.date)}
                onChange={(checked) => { setChosenNights((prev) => checked ? [...prev, night.date] : prev.filter((date) => date !== night.date)); reset(); }}>
                {night.pre_trip ? `Night before the trip · ${night.date_label}` : `Night of ${night.date_label}`}{night.last_night && <span className="text-muted-foreground"> · Last night</span>}
              </Check>)}
            </Group>
            <Group legend="Plan for those nights" invalid={errorField === "plan" || errorField === "assignments"}>
              {(data.lodging?.stays ?? []).filter((saved) => saved.check_in).map((saved) => <Check key={saved.id} type="radio" name="plan" checked={plan === `stay:${saved.id}`} onChange={() => { setPlan(`stay:${saved.id}`); reset(); }}>
                <span className="break-words">{saved.name}</span> <span className="text-muted-foreground">· {saved.date_label}</span>
              </Check>)}
              <Check type="radio" name="plan" checked={plan === "no_stay"} onChange={() => { setPlan("no_stay"); reset(); }}>No accommodation needed</Check>
              <Check type="radio" name="plan" checked={plan === "unplanned"} onChange={() => { setPlan("unplanned"); reset(); }}>Not planned</Check>
            </Group>
            <p className="text-base text-muted-foreground">Everyone else&apos;s nights stay as they are. A night someone isn&apos;t on the trip is skipped.</p>
            {who.length === 1 && <p className="text-base text-foreground">Not on the trip those nights?{" "}
              <Button type="button" variant="link" className="h-auto min-h-11 p-0" onClick={() => switchToAttendance(who[0])}>Change {possessive(people.find((person) => person.member_id === who[0])?.display_name ?? "their")} trip dates</Button></p>}
          </> : editor.action === "attendance" ? <>
            {attendee && <p className="break-words text-base text-foreground">{attendee.display_name}{personNote(attendee) && <span className="text-muted-foreground"> · {personNote(attendee)}</span>}</p>}
            <label className="block space-y-1 text-base text-foreground"><span>First night on the trip</span>
              <select name="arrival_date" value={attendance.arrival_date} className={fieldClassName} aria-invalid={errorField === "arrival_date" || undefined}
                onChange={(event) => { setAttendance((prev) => ({ ...prev, arrival_date: event.target.value })); reset(); }}>
                <option value="">From the start · Night before the trip</option>
                {nights.filter((night) => !night.pre_trip).map((night) => <option key={night.date} value={night.date}>Night of {night.date_label}</option>)}
              </select></label>
            <label className="block space-y-1 text-base text-foreground"><span>Leaves</span>
              <select name="departure_date" value={attendance.departure_date} className={fieldClassName} aria-invalid={errorField === "departure_date" || undefined}
                onChange={(event) => { setAttendance((prev) => ({ ...prev, departure_date: event.target.value })); reset(); }}>
                <option value="">At the end · The morning after the last night</option>
                {nights.filter((night) => !night.pre_trip).map((night) => <option key={night.date} value={night.date}>Morning of {night.date_label}</option>)}
              </select></label>
            <p className="text-base text-muted-foreground">The first night is on the trip; the morning they leave isn&apos;t another night.</p>
            <Group legend="Days they're there but not taking part" invalid={errorField === "skipped_dates"}>
              <p className="text-base text-muted-foreground">For example, the day of an evening arrival.</p>
              {(data.lodging?.days ?? []).map((day) => <Check key={day.date} name="skipped_dates" checked={attendance.skipped_dates.includes(day.date)}
                onChange={(checked) => { setAttendance((prev) => ({ ...prev, skipped_dates: checked ? [...prev.skipped_dates, day.date].sort() : prev.skipped_dates.filter((date) => date !== day.date) })); reset(); }}>
                {nightLabel(day.date)}
              </Check>)}
            </Group>
          </> : <>
            <p className="text-base text-foreground">Night of {nightLabel(editor.date!)}</p>
            <p className="text-base text-muted-foreground">Current plan: {data.lodging?.nights.find((night) => night.date === editor.date)?.label ?? "Not planned yet"}</p>
            <label className="block space-y-1 text-base text-foreground"><span>Change night plan to</span><select name="night_status" required value={nightStatus} className={fieldClassName} onChange={(event) => { setNightStatus(event.target.value); setPreview(null); }}><option value="">Choose a night plan</option><option value="no_stay">No stay needed</option><option value="unplanned">Not planned yet</option></select></label>
            <p className="text-base text-muted-foreground">Neither choice sets the next morning’s starting point. To assign lodging, add or date a stay.</p>
          </>}
        </fieldset>
      </form>
      {preview && <section className="rounded-control border border-border p-3 text-base text-foreground">
        <h3 tabIndex={-1} ref={reviewRef} className="font-semibold">{editor.action === "remove" ? "Removal preview" : "Night preview"}</h3>
        {editor.action === "save" && <p className="mt-1">{preview.date_label}</p>}
        {preview.summary.length > 0 ? <>
          <ul className="mt-2 space-y-2">{preview.summary.map((line) => <li key={line} className="break-words">{line}</li>)}</ul>
          <p className="mt-2 text-muted-foreground">Nobody else&apos;s nights change.</p>
          {preview.changes.some((entry) => entry.morning) && <details className="mt-2"><summary className="min-h-11 cursor-pointer py-2">The mornings after</summary>
            <ul className="space-y-1">{preview.changes.filter((entry) => entry.morning).map((entry) => <li key={`${entry.member_id}:${entry.date}`} className="break-words">{entry.morning}: {entry.display_name} starts from {entry.morning_origin}</li>)}</ul>
          </details>}
        </> : <>
          {!preview.nights.length && !preview.day_changes.length && <p className="mt-2">No night assignments will change.</p>}
          <ul className="mt-2 space-y-3">{preview.nights.map((night) => <li key={night.date} className="break-words">
            <p>{night.date_label}: {night.before} → {night.after}</p>
            {night.morning && <p className="text-muted-foreground">{night.morning} starting point: {night.morning_origin}</p>}
          </li>)}</ul>
        </>}
        {preview.day_changes.length > 0 && <ul className="mt-2 space-y-1">{preview.day_changes.map((day) => <li key={day.date} className="break-words">
          {day.date_label}: {day.before} → {day.after}{day.kit_saved ? " · Saved outfit kept" : ""}</li>)}</ul>}
        {!!preview.review_dates.length && <p className="mt-3 text-warning">Review nights outside the itinerary: {preview.review_dates.map(nightLabel).join(", ")}. These dates will be kept.</p>}
        {!!preview.conflicts.length && <label className="mt-3 flex min-h-11 items-start gap-3"><input type="checkbox" checked={replacement} disabled={busy} onChange={(event) => setReplacement(event.target.checked)} className="mt-1 size-5 shrink-0" />
          <span>{editor.action === "attendance" ? `Clear their plans for ${conflictDates}. Stay records and booking statuses are kept.` : `Replace the existing plans for ${conflictDates}. Keep all stay records and booking statuses.`}</span></label>}
        {editor.action === "save" && <Button type="button" variant="outline" className="mt-3" disabled={busy} onClick={() => { setPreview(null); form.current?.querySelector<HTMLInputElement>('input[name="check_in"]')?.focus(); }}>Change dates</Button>}
      </section>}
      {busy && <p role="status" className="text-base text-muted-foreground">{preview ? "Saving lodging…" : "Loading night preview…"}</p>}
    </div>}
  </TripSheet>;
}

function Group({ legend, invalid, children }: { legend: string; invalid?: boolean; children: ReactNode }) {
  return <fieldset className="min-w-0 space-y-1" aria-describedby={invalid ? "stay-error" : undefined}>
    <legend className="mb-1 text-base font-medium text-foreground">{legend}</legend>{children}
  </fieldset>;
}

function Check({ type = "checkbox", name, checked, disabled, onChange, children }: {
  type?: "checkbox" | "radio"; name: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void; children: ReactNode;
}) {
  return <label className="flex min-h-11 items-start gap-3 py-2.5 text-base text-foreground">
    <input type={type} name={name} checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 size-5 shrink-0" />
    <span className="min-w-0">{children}</span>
  </label>;
}

/** Named people with an Everyone shortcut for the crew; a pending invitation is never part of Everyone. */
function PeopleChecklist({ name, people, selected, disabled, onChange }: {
  name: string; people: TripLodgingPerson[]; selected: string[]; disabled?: boolean; onChange: (next: string[]) => void;
}) {
  const crew = people.filter((person) => CREW.has(person.membership)).map((person) => person.member_id);
  const everyone = crew.length > 0 && crew.every((id) => selected.includes(id));
  const invited = people.some((person) => person.membership === "invited");
  return <>
    {crew.length > 1 && <Check name={`${name}-everyone`} checked={everyone} disabled={disabled}
      onChange={(checked) => onChange(checked ? [...new Set([...selected, ...crew])] : selected.filter((id) => !crew.includes(id)))}>
      Everyone on the crew ({crew.length}){invited && <span className="text-muted-foreground"> · Pending invitations aren&apos;t included</span>}
    </Check>}
    <div className={cn(crew.length > 1 && "pl-8")}>
      {people.map((person) => <Check key={person.member_id} name={name} checked={selected.includes(person.member_id)} disabled={disabled}
        onChange={(checked) => onChange(checked ? [...selected, person.member_id] : selected.filter((id) => id !== person.member_id))}>
        <span className="break-words">{person.display_name}</span>{personNote(person) && <span className="text-muted-foreground"> · {personNote(person)}</span>}
      </Check>)}
    </div>
  </>;
}
