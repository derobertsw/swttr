"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, fieldClassName } from "@/components/ui/input";
import { TripSheet, TripSheetDescription, TripSheetTitle } from "@/components/trips/TripSheet";
import { useTemperatureUnit } from "@/components/TemperatureUnitProvider";
import { useReturnFocus } from "@/hooks/useReturnFocus";
import { useTripEditorHistory } from "@/hooks/useTripEditorHistory";
import { TOUR_ACTIVITY } from "@/lib/trip-activities";
import { accessPointFor } from "@/lib/trip-location";
import { errorMessage, timedTripRequest, TripRequestError } from "@/lib/trip-requests";
import { cn } from "@/lib/utils";
import type { TripFull, TripTourPlanInput, TripTourPlanSummary } from "@/types/trips";

type Draft = Record<
  | "objective" | "route_url" | "meet_time" | "meet_day_offset" | "distance" | "distance_unit" | "ascent" | "ascent_unit"
  | "duration_hours" | "duration_mins" | "metrics_source" | "metrics_source_url" | "approach_notes" | "access_notes"
  | "access_url" | "backup_plan" | "return_time" | "return_day_offset" | "checkin_notes" | "pickup_notes",
  string
>;

function draftOf(plan: TripTourPlanSummary | undefined, metric: boolean): Draft {
  const text = (value: string | number | null | undefined) => value == null ? "" : String(value);
  return {
    objective: text(plan?.objective), route_url: text(plan?.route_url),
    meet_time: plan?.meet_time?.slice(0, 5) ?? "", meet_day_offset: text(plan?.meet_day_offset ?? 0),
    distance: text(plan?.distance), distance_unit: plan?.distance_unit ?? (metric ? "km" : "mi"),
    ascent: text(plan?.ascent), ascent_unit: plan?.ascent_unit ?? (metric ? "m" : "ft"),
    duration_hours: plan?.duration_minutes == null ? "" : String(Math.floor(plan.duration_minutes / 60)),
    duration_mins: plan?.duration_minutes == null ? "" : String(plan.duration_minutes % 60),
    metrics_source: text(plan?.metrics_source), metrics_source_url: text(plan?.metrics_source_url),
    approach_notes: text(plan?.approach_notes), access_notes: text(plan?.access_notes), access_url: text(plan?.access_url),
    backup_plan: text(plan?.backup_plan), return_time: plan?.return_time?.slice(0, 5) ?? "",
    return_day_offset: text(plan?.return_day_offset ?? 0), checkin_notes: text(plan?.checkin_notes), pickup_notes: text(plan?.pickup_notes),
  };
}

/** The draft as the API takes it. The server checks every field. */
function planBody(draft: Draft): Record<keyof TripTourPlanInput, unknown> {
  const value = (key: keyof Draft) => draft[key].trim() || null;
  const hours = draft.duration_hours.trim(), minutes = draft.duration_mins.trim();
  return {
    objective: draft.objective, route_url: value("route_url"),
    meet_time: value("meet_time"), meet_day_offset: Number(draft.meet_day_offset),
    distance: value("distance"), distance_unit: value("distance") ? draft.distance_unit : null,
    ascent: value("ascent"), ascent_unit: value("ascent") ? draft.ascent_unit : null,
    duration_minutes: hours || minutes ? Number(hours || 0) * 60 + Number(minutes || 0) : null,
    metrics_source: value("metrics_source"), metrics_source_url: value("metrics_source_url"),
    approach_notes: value("approach_notes"), access_notes: value("access_notes"), access_url: value("access_url"),
    backup_plan: value("backup_plan"), return_time: value("return_time"), return_day_offset: Number(draft.return_day_offset),
    checkin_notes: value("checkin_notes"), pickup_notes: value("pickup_notes"),
  };
}

/**
 * A Backcountry day's tour plan (#210): the saved plan to read, with Add or
 * Change for the organizer. On a day with another activity, a saved plan is
 * kept behind a disclosure with Restore, which sets the activity back.
 */
export function DayTourPlan({ data, date, dateLabel, activity, canEdit, onSaved, onRestore }: {
  data: TripFull;
  date: string;
  dateLabel: string;
  /** The activity the day page shows: the day's own or its stop's first. */
  activity: string | null;
  canEdit: boolean;
  onSaved: () => Promise<void>;
  /** Sets the day's activity back to Backcountry; rejects with the reason it couldn't. */
  onRestore: () => Promise<void>;
}) {
  const plan = data.tour_plans?.find((saved) => saved.date === date);
  const day = data.days.find((candidate) => candidate.date === date);
  // Where the crew meets is the day's access point (#208), set under Getting there.
  const meetingPoint = day ? accessPointFor(data.stops, day)?.location.label ?? null : null;
  // Keep the opened plan/day as the editor's baseline across trip refreshes.
  // New revisions must go through conflict review, never reset a pending draft.
  const [editorSession, setEditorSession] = useState<{
    plan: TripTourPlanSummary | undefined;
    dayId: string | undefined;
  } | null>(null);
  const [status, setStatus] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const focus = useReturnFocus();
  const active = activity === TOUR_ACTIVITY;
  // Restore replaces its own button with the plan, so focus moves to the plan's heading.
  const focusAfterRestore = useRef(false);
  useEffect(() => {
    if (!active || !focusAfterRestore.current) return;
    focusAfterRestore.current = false;
    document.getElementById("tour-plan-heading")?.focus();
  }, [active]);
  if (!active && !plan && !editorSession) return null;

  const open = () => {
    focus.remember(() => document.getElementById("tour-plan-heading"));
    setEditorSession({ plan, dayId: day?.id });
  };
  const restore = async () => {
    setRestoring(true); setRestoreError(null);
    focusAfterRestore.current = true;
    try { await onRestore(); setStatus("Tour plan restored. The day's activity is Backcountry again."); }
    catch (err) { focusAfterRestore.current = false; setRestoreError(errorMessage(err)); }
    finally { setRestoring(false); }
  };
  const editor = editorSession && <TourPlanEditor tripId={data.trip.id} date={date} dateLabel={dateLabel} plan={editorSession.plan}
    dayId={editorSession.dayId} meetingPoint={meetingPoint}
    onClose={() => setEditorSession(null)} onCloseAutoFocus={focus.restore}
    onSaved={async (message) => { setStatus(message); await onSaved(); }} />;

  if (!active && plan) {
    return (<>
      <Card>
        <details>
          <summary id="tour-plan-heading" className="min-h-11 cursor-pointer py-2 text-base font-semibold text-foreground">Saved tour plan · {plan.objective}</summary>
          <p className="mt-1 text-base text-foreground">
            This day&apos;s activity is {activity ?? "not set"}, so the tour plan isn&apos;t in use. It&apos;s kept as saved.
          </p>
          <div className="mt-3"><TourPlanSummary plan={plan} meetingPoint={meetingPoint} /></div>
          <Button type="button" variant="outline" className="mt-3" loading={restoring} onClick={() => void restore()}>
            Restore tour plan
          </Button>
          <p className="mt-1 text-sm text-muted-foreground">Sets this day&apos;s activity back to {TOUR_ACTIVITY}.</p>
          {restoreError && <p role="alert" className="mt-2 text-base text-destructive">Couldn&apos;t restore the tour plan: {restoreError}</p>}
        </details>
        <p aria-live="polite" className="text-sm text-success">{status}</p>
      </Card>
      {editor}
    </>);
  }

  return (<>
    {active && <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="tour-plan-heading" tabIndex={-1} className="text-title font-semibold text-foreground">Tour plan</h2>
        {canEdit && <Button type="button" variant="outline" onClick={open}>{plan ? "Change tour plan" : "Add tour plan"}</Button>}
      </div>
      {!canEdit && <p className="mt-1 text-base text-muted-foreground">Managed by the organizer</p>}
      <p aria-live="polite" className="text-sm text-success">{status}</p>
      {plan ? <div className="mt-2"><TourPlanSummary plan={plan} meetingPoint={meetingPoint} /></div> : (
        <p className="mt-2 text-base text-muted-foreground">
          No tour plan yet.{canEdit ? " Add the route, when to meet and a backup plan; everything but the route is optional." : ""}
        </p>
      )}
    </Card>}
    {editor}
  </>);
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words whitespace-pre-wrap text-foreground">{children}</dd>
    </div>
  );
}

const externalLink = "inline-flex min-h-11 items-center text-primary underline";

/**
 * A saved plan, read-only: the essentials first, then the rest on demand. The
 * meeting point is the day's access point, so Getting there changes it.
 */
function TourPlanSummary({ plan, meetingPoint }: { plan: TripTourPlanSummary; meetingPoint: string | null }) {
  const more = plan.metrics_label || plan.approach_notes || plan.pickup_notes;
  return (
    <div className="text-base">
      <dl className="space-y-2">
        <Row label="Route">
          {plan.objective}
          {plan.route_url && <><br /><a href={plan.route_url} target="_blank" rel="noopener noreferrer" className={externalLink}>Open route link (new tab)</a></>}
        </Row>
        <Row label="Meet">{plan.meet_label ?? "Time not set"} · {meetingPoint ?? "Meeting point not set"}</Row>
        <Row label="Backup plan">{plan.backup_plan ?? "Not set"}</Row>
        <Row label="Return target">{plan.return_label ?? "Not set"}</Row>
        {plan.checkin_notes && <Row label="Check-in plan (crew notes)">{plan.checkin_notes}</Row>}
        {(plan.access_notes || plan.access_url) && (
          <Row label="Access and permits">
            {plan.access_notes}
            {plan.access_url && <>{plan.access_notes && <br />}<a href={plan.access_url} target="_blank" rel="noopener noreferrer" className={externalLink}>Open access information (new tab)</a></>}
          </Row>
        )}
      </dl>
      {more && (
        <details className="mt-2">
          <summary className="min-h-11 cursor-pointer py-2 text-foreground">More tour details</summary>
          <dl className="space-y-2 pb-2">
            {plan.metrics_label && (
              <Row label="Distance, ascent and time">
                {plan.metrics_label}
                <br /><span className="text-muted-foreground">{plan.metrics_source_label}</span>
                {plan.metrics_source_url && <><br /><a href={plan.metrics_source_url} target="_blank" rel="noopener noreferrer" className={externalLink}>Open source (new tab)</a></>}
              </Row>
            )}
            {plan.approach_notes && <Row label="Approach (ski or walk)">{plan.approach_notes}</Row>}
            {plan.pickup_notes && <Row label="Exit or pickup">{plan.pickup_notes}</Row>}
          </dl>
        </details>
      )}
      {plan.time_zone_label && <p className="mt-2 text-sm text-muted-foreground">{plan.time_zone_label}</p>}
      <p className="mt-1 text-sm text-muted-foreground">{plan.updated_label}</p>
    </div>
  );
}

function TourPlanEditor({ tripId, date, dateLabel, plan, dayId, meetingPoint, onClose, onSaved, onCloseAutoFocus }: {
  tripId: string;
  date: string;
  dateLabel: string;
  plan: TripTourPlanSummary | undefined;
  /** The day the editor opened for; after a date change another day can hold this date. */
  dayId: string | undefined;
  meetingPoint: string | null;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
  onCloseAutoFocus: (event: Event) => void;
}) {
  const { temperatureUnit } = useTemperatureUnit();
  const [draft, setDraft] = useState(() => draftOf(plan, temperatureUnit === "C"));
  const [original] = useState(() => JSON.stringify(draft));
  const [revision, setRevision] = useState(plan?.revision ?? 0);
  const [day, setDay] = useState(dayId);
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  // The plan saved now, after a conflict: null when there's none any more.
  const [savedPlan, setSavedPlan] = useState<TripTourPlanSummary | null | undefined>(undefined);
  const [discarding, setDiscarding] = useState(false);
  const [closed, setClosed] = useState(false);
  // One identity per input, so a retry of an uncertain save replays rather than saving twice.
  const mutationId = useRef<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const dirty = JSON.stringify(draft) !== original;

  const handleBack = () => {
    if (busy) return true;
    if (removing) { setRemoving(false); return true; }
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
  const change = (field: keyof Draft, value: string) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
    mutationId.current = null;
    setError(null); setErrorField(null);
  };
  const showError = (err: unknown) => {
    setError(errorMessage(err));
    setConflict(err instanceof TripRequestError && err.status === 409);
    setErrorField(err instanceof TripRequestError && typeof err.details?.field === "string" ? err.details.field : null);
  };
  useEffect(() => {
    if (busy || !errorField) return;
    const field = form.current?.elements.namedItem(errorField);
    if (field instanceof HTMLElement) {
      const details = field.closest("details");
      if (details) details.open = true;
      field.focus();
    }
  }, [busy, errorField]);

  const send = async (method: "PUT" | "DELETE", body: object, message: string) => {
    if (busy) return;
    mutationId.current ??= crypto.randomUUID();
    setBusy(true); setError(null); setErrorField(null);
    try {
      await timedTripRequest(`/api/v1/trips/${tripId}/days/${date}/tour-plan`, method,
        { ...body, day_id: day, expected_revision: revision, mutation_id: mutationId.current });
      await onSaved(message);
      close();
    } catch (err) { showError(err); }
    finally { setBusy(false); }
  };
  const save = (event?: FormEvent) => {
    event?.preventDefault();
    void send("PUT", { plan: planBody(draft) }, "Tour plan saved.");
  };
  const remove = () => {
    if (!removing) { mutationId.current = null; setRemoving(true); return; }
    void send("DELETE", {}, "Tour plan removed.");
  };
  const inspect = async () => {
    setBusy(true); setError(null);
    try {
      const current = await timedTripRequest<TripFull>(`/api/v1/trips/${tripId}`, "GET");
      const saved = current.tour_plans?.find((entry) => entry.date === date) ?? null;
      setSavedPlan(saved); setRevision(saved?.revision ?? 0); setConflict(false);
      setDay(current.days.find((entry) => entry.date === date)?.id);
      mutationId.current = null;
    } catch (err) { showError(err); }
    finally { setBusy(false); }
  };

  const field = (key: keyof Draft, label: string, options: { type?: string; required?: boolean; maxLength?: number; hint?: string; inputMode?: "decimal" | "numeric" } = {}) => (
    <label className="block min-w-0 space-y-1 text-base text-foreground">
      <span>{label}</span>
      <Input name={key} type={options.type ?? "text"} required={options.required} maxLength={options.maxLength} inputMode={options.inputMode}
        value={draft[key]} onChange={(event) => change(key, event.target.value)} className={fieldClassName}
        aria-invalid={errorField === key || undefined} aria-describedby={errorField === key ? "tour-plan-error" : options.hint ? `${key}-hint` : undefined} />
      {options.hint && <span id={`${key}-hint`} className="block text-sm text-muted-foreground">{options.hint}</span>}
    </label>
  );
  const notes = (key: keyof Draft, label: string, maxLength: number, hint?: string) => (
    <label className="block min-w-0 space-y-1 text-base text-foreground">
      <span>{label}</span>
      <textarea name={key} rows={3} maxLength={maxLength} value={draft[key]} onChange={(event) => change(key, event.target.value)}
        className={cn(fieldClassName, "h-auto py-2")} aria-invalid={errorField === key || undefined}
        aria-describedby={errorField === key ? "tour-plan-error" : hint ? `${key}-hint` : undefined} />
      {hint && <span id={`${key}-hint`} className="block text-sm text-muted-foreground">{hint}</span>}
    </label>
  );
  const select = (key: keyof Draft, label: string, choices: Array<[string, string]>) => (
    <label className="block min-w-0 space-y-1 text-base text-foreground">
      <span>{label}</span>
      <select name={key} value={draft[key]} onChange={(event) => change(key, event.target.value)} className={fieldClassName}
        aria-invalid={errorField === key || undefined}>
        {choices.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select>
    </label>
  );

  const title = discarding ? "Discard changes?" : removing ? "Remove tour plan?" : plan ? "Change tour plan" : "Add tour plan";
  return (
    <TripSheet open={!closed} busy={busy} onClose={requestClose} className="sm:max-w-xl"
      onCloseAutoFocus={(event) => { onCloseAutoFocus(event); onClose(); }}
      header={<>
        <TripSheetTitle>{title}</TripSheetTitle>
        <TripSheetDescription>{discarding ? "The saved tour plan will be kept." : `${dateLabel} · Shared with the crew · Managed by the organizer`}</TripSheetDescription>
      </>}
      footer={discarding ? <>
        <Button type="button" onClick={(event) => { event.preventDefault(); setDiscarding(false); history.ensureEntry(); }}>Keep editing</Button>
        <Button type="button" variant="outline" onClick={close}>Discard changes</Button>
      </> : conflict ? <>
        <Button type="button" loading={busy} onClick={() => void inspect()}>Review saved plan</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={requestClose}>Cancel</Button>
      </> : removing ? <>
        <Button type="button" variant="destructive" loading={busy} onClick={remove}>Remove tour plan</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => setRemoving(false)}>Keep tour plan</Button>
      </> : <>
        <Button type="submit" form="tour-plan-form" loading={busy}>Save tour plan</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={requestClose}>Cancel</Button>
        {plan && revision > 0 && <Button type="button" variant="ghost" disabled={busy} onClick={remove}>Remove tour plan</Button>}
      </>}
    >
      {!discarding && <div className="space-y-4">
        {savedPlan !== undefined && (
          <div className="rounded-control border border-warning p-3 text-base text-foreground">
            <p>{savedPlan ? "The saved plan is below. Your changes are still in the form; save to replace it." : "There's no saved tour plan for this day now. Save to add yours."}</p>
            {savedPlan && <div className="mt-2"><TourPlanSummary plan={savedPlan} meetingPoint={meetingPoint} /></div>}
          </div>
        )}
        {error && <p id="tour-plan-error" role="alert" className="text-base text-destructive">{error}</p>}
        {removing ? (
          <p className="break-words text-base text-foreground">
            The route, times and notes for {dateLabel} ({plan?.objective}) will be deleted for everyone on the trip. The day keeps its activity.
          </p>
        ) : (
          <form id="tour-plan-form" ref={form} onSubmit={save} className="space-y-4" aria-busy={busy}>
            <fieldset disabled={busy} className="min-w-0 space-y-4">
              {field("objective", "Route or objective", { required: true, maxLength: 200 })}
              <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                {field("meet_time", "Meet time (destination time)", { type: "time" })}
                {select("meet_day_offset", "Meet on", [["0", dateLabel], ["-1", "The day before"]])}
              </div>
              <div className="min-w-0 text-base">
                <p className="text-muted-foreground">Meeting point</p>
                <p className="break-words text-foreground">{meetingPoint ?? "Meeting point not set"}</p>
                <p className="mt-1 text-sm text-muted-foreground">Change the day&apos;s access point in Getting there.</p>
              </div>
              <details className="text-base text-foreground">
                <summary className="min-h-11 cursor-pointer py-2">Route link, distance and time (optional)</summary>
                <div className="space-y-3">
                  {field("route_url", "Route or map link", { type: "url", maxLength: 2000 })}
                  <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3">
                    {field("distance", "Distance", { inputMode: "decimal" })}
                    {select("distance_unit", "Distance unit", [["km", "km"], ["mi", "mi"]])}
                    {field("ascent", "Ascent", { inputMode: "numeric" })}
                    {select("ascent_unit", "Ascent unit", [["m", "m"], ["ft", "ft"]])}
                  </div>
                  <fieldset className="min-w-0">
                    <legend className="text-base text-foreground">Expected duration</legend>
                    <div className="mt-1 grid grid-cols-2 gap-3">
                      {field("duration_hours", "Hours", { inputMode: "numeric" })}
                      {field("duration_mins", "Minutes", { inputMode: "numeric" })}
                    </div>
                  </fieldset>
                  {field("metrics_source", "Where these figures come from", { maxLength: 200, hint: "Leave blank for the crew's own estimate." })}
                  {field("metrics_source_url", "Source link", { type: "url", maxLength: 2000 })}
                </div>
              </details>
              <details className="text-base text-foreground">
                <summary className="min-h-11 cursor-pointer py-2">Approach, access and permits (optional)</summary>
                <div className="space-y-3">
                  {notes("approach_notes", "Approach (ski or walk)", 4000, "Separate from the drive, e.g. a hut approach.")}
                  {notes("access_notes", "Parking, road access and permits", 4000)}
                  {field("access_url", "Access or permit link", { type: "url", maxLength: 2000 })}
                </div>
              </details>
              <details className="text-base text-foreground">
                <summary className="min-h-11 cursor-pointer py-2">Backup and return (optional)</summary>
                <div className="space-y-3">
                  {notes("backup_plan", "Backup plan", 4000, "An alternative route or plan if conditions or the crew need it.")}
                  <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                    {field("return_time", "Return target (destination time)", { type: "time", hint: "Your turnaround or back-at-the-car time." })}
                    {select("return_day_offset", "Return on", [["0", dateLabel], ["1", "The day after"]])}
                  </div>
                  {notes("checkin_notes", "Check-in plan (crew notes)", 2000, "Who to tell and by when. SWTTR doesn't send messages or watch for check-ins.")}
                  {notes("pickup_notes", "Exit or pickup", 2000, "For a point-to-point tour: where it ends and how you get back.")}
                </div>
              </details>
            </fieldset>
          </form>
        )}
        {busy && <p role="status" className="text-base text-muted-foreground">{removing ? "Removing tour plan…" : conflict ? "Loading the saved plan…" : "Saving tour plan…"}</p>}
      </div>}
    </TripSheet>
  );
}
