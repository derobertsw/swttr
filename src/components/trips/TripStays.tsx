"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, fieldClassName } from "@/components/ui/input";
import { SectionLabel } from "@/components/trips/trip-primitives";
import { cn } from "@/lib/utils";
import { TripSheet, TripSheetDescription, TripSheetTitle } from "@/components/trips/TripSheet";
import { useReturnFocus } from "@/hooks/useReturnFocus";
import { useTripEditorHistory } from "@/hooks/useTripEditorHistory";
import { errorMessage, tripRequest, TripRequestError } from "@/lib/trip-requests";
import type { TripFull, TripLodgingAction, TripLodgingPreview, TripStayInput, TripStaySummary } from "@/types/trips";

type Editor = { action: TripLodgingAction; stay?: TripStaySummary; date?: string; focus?: string };
const blankStay = (): TripStayInput => ({ id: crypto.randomUUID(), name: "", check_in: null, check_out: null, type: null, address: null, property_url: null, check_in_time: null, check_out_time: null, notes: null, booking_status: "not_booked" });

async function lodgingRequest<T>(url: string, method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20_000);
  try { return await tripRequest<T>(url, method, body, { signal: controller.signal }); }
  catch (err) {
    if (controller.signal.aborted) throw new Error("The request took too long. Your changes are still here; try again.");
    throw err;
  } finally { window.clearTimeout(timeout); }
}

export function TripStays({ data, canEdit, onSaved }: { data: TripFull; canEdit: boolean; onSaved: () => Promise<void> }) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [status, setStatus] = useState("");
  const focus = useReturnFocus();
  const lodging = data.lodging;
  const open = (next: Editor) => {
    focus.remember(() => document.getElementById("trip-stays-heading"));
    setEditor(next);
  };
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="trip-stays-heading" tabIndex={-1} className="text-lg font-semibold text-foreground">Stays</h2>
        {canEdit && <Button type="button" variant="outline" onClick={() => open({ action: "save" })}>Add stay</Button>}
      </div>
      <p className="mt-1 text-base text-muted-foreground">Crew stay · One shared place each night</p>
      {!canEdit && <p className="mt-1 text-base text-muted-foreground">Managed by the organizer</p>}
      <p aria-live="polite" className="text-sm text-success">{status}</p>
      {!(lodging?.stays.length) && <p className="mt-3 text-base text-muted-foreground">No stays saved yet. Accommodation can be planned later.</p>}
      <div className="mt-3 divide-y divide-border">
        {lodging?.stays.map((stay) => (
          <article key={stay.id} className="min-w-0 py-3">
            <h3 className="break-words text-base font-semibold text-foreground">{stay.name}</h3>
            <p className="mt-1 text-base text-foreground">{stay.date_label}</p>
            <p className="text-base text-muted-foreground">{stay.booking_status === "booked" ? "Booked" : "Not booked"} · {stay.address ? "Location confirmation needed for drive times" : "Location not set"}</p>
            {stay.check_in && <p className="mt-1 text-sm text-muted-foreground">Assigned crew nights: {stay.assigned_nights.length ? stay.assigned_nights.join(", ") : "None"}</p>}
            {!!stay.review_dates.length && <p className="mt-2 text-base text-warning">Review dates outside the itinerary: {stay.review_dates.join(", ")}. Stay dates and bookings have been kept.</p>}
            <details className="mt-2 text-base text-foreground">
              <summary className="min-h-11 cursor-pointer py-2">Stay details</summary>
              <div className="space-y-2 break-words pb-2">
                {stay.type && <p>Type: {stay.type}</p>}
                {stay.address && <p>Address: {stay.address}</p>}
                {stay.check_in_time && <p>Check-in time: {stay.check_in_time.slice(0, 5)} · property local time</p>}
                {stay.check_out_time && <p>Check-out time: {stay.check_out_time.slice(0, 5)} · property local time</p>}
                {stay.notes && <p className="whitespace-pre-wrap">Crew notes: {stay.notes}</p>}
                {stay.property_url && <a href={stay.property_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-primary underline">Open property website (new tab)</a>}
              </div>
            </details>
            {canEdit && <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => open({ action: "save", stay })} aria-label={`Edit ${stay.name}`}>Edit</Button>
              {!stay.check_in && <Button type="button" variant="outline" onClick={() => open({ action: "save", stay, focus: "check_in" })}>Add dates</Button>}
              {!stay.address && <Button type="button" variant="outline" onClick={() => open({ action: "save", stay, focus: "address" })}>Set location</Button>}
              <Button type="button" variant="outline" onClick={() => open({ action: "remove", stay })} aria-label={`Remove ${stay.name} from trip`}>Remove from trip</Button>
            </div>}
          </article>
        ))}
      </div>
      {!!lodging?.nights.length && <details className="mt-3 text-foreground">
        <summary className="min-h-11 cursor-pointer py-2 text-base">Crew nights</summary>
        <ul className="space-y-2">
          {lodging.nights.map((night) => <li key={night.date} className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border p-2">
            <div className="min-w-0 break-words text-base"><p>{night.date_label}{night.pre_trip ? " · Pre-trip night" : ""}</p><p className="text-muted-foreground">{night.label}</p></div>
            {canEdit && <Button type="button" variant="outline" onClick={() => open({ action: "night", date: night.date })} aria-label={`Change night ${night.date}`}>Change</Button>}
          </li>)}
        </ul>
      </details>}
      {editor && <StayEditor key={`${editor.action}:${editor.stay?.id ?? editor.date ?? "new"}`} editor={editor} data={data}
        onClose={() => setEditor(null)} onCloseAutoFocus={focus.restore} onSaved={async () => {
          setStatus(editor.action === "remove" ? "Stay removed from trip." : editor.action === "night" ? "Night plan saved." : "Stay saved.");
          await onSaved();
        }} />}
    </Card>
  );
}

function StayEditor({ editor, data, onClose, onSaved, onCloseAutoFocus }: {
  editor: Editor; data: TripFull; onClose: () => void; onSaved: () => Promise<void>; onCloseAutoFocus: (event: Event) => void;
}) {
  const [stay, setStay] = useState<TripStayInput>(() => editor.stay ? {
    id: editor.stay.id, name: editor.stay.name, check_in: editor.stay.check_in, check_out: editor.stay.check_out,
    type: editor.stay.type, address: editor.stay.address, property_url: editor.stay.property_url,
    check_in_time: editor.stay.check_in_time?.slice(0, 5) ?? null, check_out_time: editor.stay.check_out_time?.slice(0, 5) ?? null,
    notes: editor.stay.notes, booking_status: editor.stay.booking_status,
  } : blankStay());
  const [original] = useState(() => JSON.stringify(stay));
  const [revision, setRevision] = useState(data.lodging?.revision ?? 0);
  const [nightStatus, setNightStatus] = useState("");
  const dirty = editor.action === "save" ? JSON.stringify(stay) !== original : editor.action === "night" && nightStatus !== "";
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
  const change = (field: keyof TripStayInput, value: string) => {
    setStay((prev) => ({ ...prev, [field]: field === "name" ? value : value || null }));
    setPreview(null); setErrorField(null); setError(null); setReplacement(false);
  };
  const requestBody = () => ({ action: editor.action, stay, existing: !!editor.stay, stay_id: editor.stay?.id, date: editor.date, status: nightStatus, expected_revision: revision });
  const showError = (err: unknown) => {
    setError(errorMessage(err));
    setConflict(err instanceof TripRequestError && err.status === 409);
    const field = err instanceof TripRequestError && typeof err.details?.field === "string" ? err.details.field : null;
    setErrorField(field);
  };
  useEffect(() => {
    if (busy || !errorField) return;
    const input = form.current?.elements.namedItem(errorField);
    if (input instanceof HTMLElement) {
      const details = input.closest("details");
      if (details) details.open = true;
      input.focus();
    }
  }, [busy, errorField]);
  const prepare = async (event?: FormEvent) => {
    event?.preventDefault();
    if (busy) return;
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
    try {
      await lodgingRequest(editor.action === "night" ? `${base}/lodging-nights/${editor.date}` : `${base}/stays${editor.stay ? `/${editor.stay.id}` : ""}`,
        editor.action === "remove" ? "DELETE" : editor.action === "night" ? "PUT" : editor.stay ? "PATCH" : "POST",
        { ...requestBody(), mutation_id: mutationId.current, replace_nights: replacement });
      await onSaved(); close();
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
  const input = (field: keyof TripStayInput, label: string, type = "text", required = false, maxLength?: number) => <label className="block min-w-0 space-y-1 text-base text-foreground">
    <span>{label}</span><Input name={field} type={type} required={required} maxLength={maxLength} value={stay[field] ?? ""} onChange={(event) => change(field, event.target.value)}
      className={fieldClassName} aria-invalid={errorField === field || undefined} aria-describedby={errorField === field ? "stay-error" : undefined} />
  </label>;
  return <TripSheet open={!closed} busy={busy} onClose={requestClose} className="sm:max-w-xl" onCloseAutoFocus={(event) => { onCloseAutoFocus(event); onClose(); }}
    onOpenAutoFocus={editor.focus ? (event) => { event.preventDefault(); const control = form.current?.elements.namedItem(editor.focus!); if (control instanceof HTMLElement) control.focus(); } : undefined}
    header={<><TripSheetTitle>{discarding ? "Discard changes?" : editor.action === "remove" ? "Remove from trip" : editor.action === "night" ? "Change crew night" : editor.stay ? "Change stay" : "Add stay"}</TripSheetTitle>
      <TripSheetDescription>{discarding ? "Your saved stay will be kept." : "Crew stay · Managed by the organizer"}</TripSheetDescription></>}
    footer={discarding ? <><Button type="button" onClick={(event) => { event.preventDefault(); setDiscarding(false); history.ensureEntry(); }}>Keep editing</Button><Button type="button" variant="outline" onClick={close}>Discard changes</Button></> : <>
      {conflict ? <Button type="button" loading={busy} onClick={inspect}>Review saved plan</Button> : preview ? <Button type="button" loading={busy} disabled={preview.conflicts.length > 0 && !replacement} onClick={save}>
        {editor.action === "remove" ? "Remove from trip" : replacement ? "Replace those nights and save" : editor.action === "night" ? "Save night plan" : "Save stay"}
      </Button> : <Button type="submit" form="stay-form" loading={busy}>Review {editor.action === "remove" ? "removal" : "nights"}</Button>}
      <Button type="button" variant="outline" disabled={busy} onClick={requestClose}>Cancel</Button>
    </>}
  >
    {!discarding && <div className="space-y-4">
      {savedPlan && <div className="rounded-control border border-warning p-3 text-base text-foreground">
        <p>The saved plan is shown below. Your pending text is kept; review nights again before saving.</p>
        {savedPlan.lodging?.stays.map((saved) => <p key={saved.id} className="mt-2 break-words">{saved.name} · {saved.date_label} · {saved.booking_status === "booked" ? "Booked" : "Not booked"}{saved.notes ? ` · ${saved.notes}` : ""}</p>)}
        {!savedPlan.lodging?.stays.length && <p>No stays saved.</p>}
      </div>}
      {error && <p id="stay-error" role="alert" className="text-base text-destructive">{error}</p>}
      <form id="stay-form" ref={form} onSubmit={prepare} className="space-y-4" aria-busy={busy}>
        <fieldset disabled={busy} className="min-w-0 space-y-4">
          {editor.action === "save" ? <>
            {input("name", "Stay name", "text", true, 200)}
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">{input("check_in", "Check-in", "date")}{input("check_out", "Check-out", "date")}</div>
            <p className="text-base text-muted-foreground">Dates are optional. Check-out morning is included as a starting point, not another night.</p>
            <label className="block space-y-1 text-base text-foreground"><span>Booking status</span><select name="booking_status" value={stay.booking_status} onChange={(event) => change("booking_status", event.target.value)} className={fieldClassName}><option value="not_booked">Not booked</option><option value="booked">Booked</option></select></label>
            <details open={editor.focus === "address" || undefined} className="text-base text-foreground"><summary className="min-h-11 cursor-pointer py-2">More details (optional)</summary>
              <div className="space-y-3">
                <label className="block space-y-1"><span>Stay type</span><select name="type" value={stay.type ?? ""} onChange={(event) => change("type", event.target.value)} className={fieldClassName}><option value="">Not set</option>{["hotel", "rental", "hut", "campground", "other"].map((type) => <option key={type} value={type}>{type[0].toUpperCase() + type.slice(1)}</option>)}</select></label>
                {input("address", "Address or location description", "text", false, 1000)}
                <p className="text-base text-muted-foreground">Save an address now. Exact location confirmation for drive times will follow.</p>
                {input("property_url", "Property website", "url", false, 2000)}
                {input("check_in_time", "Check-in time (property local time)", "time")}{input("check_out_time", "Check-out time (property local time)", "time")}
                <label className="block space-y-1"><span>Notes shared with the crew</span><textarea name="notes" rows={3} maxLength={4000} className={cn(fieldClassName, "h-auto py-2")} value={stay.notes ?? ""} onChange={(event) => change("notes", event.target.value)} aria-invalid={errorField === "notes" || undefined} /></label>
                <p className="text-base text-muted-foreground">Leave out confirmation numbers, payment details and access codes.</p>
              </div>
            </details>
          </> : editor.action === "remove" ? <><p className="break-words text-base text-foreground">{editor.stay?.name}</p><p className="text-base text-foreground">Removing this stay from the trip does not cancel your booking. Assigned nights will become Not planned yet.</p></> : <>
            <p className="text-base text-foreground">Night of {editor.date}</p>
            <p className="text-base text-muted-foreground">Current plan: {data.lodging?.nights.find((night) => night.date === editor.date)?.label ?? "Not planned yet"}</p>
            <label className="block space-y-1 text-base text-foreground"><span>Change night plan to</span><select name="night_status" required value={nightStatus} className={fieldClassName} onChange={(event) => { setNightStatus(event.target.value); setPreview(null); }}><option value="">Choose a night plan</option><option value="no_stay">No stay needed</option><option value="unplanned">Not planned yet</option></select></label>
            <p className="text-base text-muted-foreground">Neither choice sets the next morning’s starting point. To assign lodging, add or date a stay.</p>
          </>}
        </fieldset>
      </form>
      {preview && <section className="rounded-control border border-border p-3 text-base text-foreground">
        <h3 tabIndex={-1} ref={reviewRef} className="font-semibold">{editor.action === "remove" ? "Removal preview" : "Night preview"}</h3>
        {editor.action === "save" && <p className="mt-1">{preview.date_label}</p>}
        {!preview.nights.length && <p className="mt-2">No night assignments will change.</p>}
        <ul className="mt-2 space-y-3">{preview.nights.map((night) => <li key={night.date} className="break-words">
          <p>{night.date_label}: {night.before} → {night.after}</p>
          {night.morning && <p className="text-muted-foreground">{night.morning} starting point: {night.morning_origin}</p>}
        </li>)}</ul>
        {!!preview.review_dates.length && <p className="mt-3 text-warning">Review nights outside the itinerary: {preview.review_dates.join(", ")}. These dates will be kept.</p>}
        {!!preview.conflicts.length && <label className="mt-3 flex min-h-11 items-start gap-3"><input type="checkbox" checked={replacement} disabled={busy} onChange={(event) => setReplacement(event.target.checked)} className="mt-1 size-5 shrink-0" /><span>Replace the existing plans for {preview.conflicts.join(", ")}. Keep all stay records and booking statuses.</span></label>}
        {editor.action === "save" && <Button type="button" variant="outline" className="mt-3" disabled={busy} onClick={() => { setPreview(null); form.current?.querySelector<HTMLInputElement>('input[name="check_in"]')?.focus(); }}>Change dates</Button>}
      </section>}
      {busy && <p role="status" className="text-base text-muted-foreground">{preview ? "Saving lodging…" : "Loading night preview…"}</p>}
    </div>}
  </TripSheet>;
}

export function DayLodging({ data, date }: { data: TripFull; date: string }) {
  const context = data.lodging?.days.find((day) => day.date === date);
  if (!context) return null;
  return <Card><SectionLabel>Crew stay</SectionLabel><dl className="mt-2 space-y-2 text-base">
    <div><dt className="text-muted-foreground">Starting from</dt><dd className="break-words text-foreground">{context.starting_from}</dd></div>
    <div><dt className="text-muted-foreground">Staying tonight</dt><dd className="break-words text-foreground">{context.staying_tonight}</dd></div>
  </dl></Card>;
}
