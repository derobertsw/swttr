"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { fieldClassName } from "@/components/ui/input";
import { errorMessage, timedTripRequest, TripRequestError } from "@/lib/trip-requests";
import { cn } from "@/lib/utils";
import type { TripDay, TripFull } from "@/types/trips";

const noticeClass = "rounded-control border border-warning p-3 text-base text-foreground";

/**
 * The organizer's control for a day's notes (#334), for every sport, under
 * Meet and start: Add notes or Edit notes opens the form. Clearing the notes
 * and saving removes them, so a stray tap can't.
 */
export function DayNotesControls({ tripId, day, dateLabel, onSaved }: {
  tripId: string;
  day: TripDay;
  dateLabel: string;
  /** Reloads the trip. */
  onSaved: () => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState("");
  const buttonId = `day-notes-${day.date}`;
  const close = (message?: string) => {
    setEditing(false);
    if (message) setStatus(message);
    setTimeout(() => document.getElementById(buttonId)?.focus(), 0);
  };

  return <div className="mt-2">
    {editing ? (
      <DayNotesEditor tripId={tripId} day={day} dateLabel={dateLabel} onCancel={() => close()} onReload={onSaved}
        onSaved={async (message) => { await onSaved(); close(message); }} />
    ) : (
      <Button id={buttonId} type="button" size="sm" variant="outline" onClick={() => { setEditing(true); setStatus(""); }}>
        {day.notes ? "Edit notes" : "Add notes"}
      </Button>
    )}
    <p aria-live="polite" className="text-sm text-success">{status}</p>
  </div>;
}

/**
 * A day's notes for everyone on the trip, as plain text. A save the day no
 * longer matches is refused (409); the text stays in the form, the brief
 * behind it shows what's saved now, and Review saved notes shows it here
 * before saving again. Reloading or leaving with unsaved text asks first, and
 * so does Cancel.
 */
function DayNotesEditor({ tripId, day, dateLabel, onCancel, onReload, onSaved }: {
  tripId: string;
  day: TripDay;
  dateLabel: string;
  onCancel: () => void;
  /** Reloads the trip, keeping the editor open. */
  onReload: () => Promise<void> | void;
  onSaved: (message: string) => Promise<void>;
}) {
  const [text, setText] = useState(day.notes ?? "");
  // The day and its notes as the editor showed them, until a review.
  const [dayId, setDayId] = useState(day.id);
  const [expected, setExpected] = useState(day.notes ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [reviewed, setReviewed] = useState<{ notes: string | null } | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const keepEditing = useRef<HTMLButtonElement>(null);
  const name = `day-notes-form-${day.date}`;
  const dirty = text.trim() !== (expected ?? "");

  useEffect(() => {
    if (busy || discarding) return;
    field.current?.focus();
  }, [busy, discarding, error]);
  useEffect(() => { if (discarding) keepEditing.current?.focus(); }, [discarding]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!dirty || busy) return;
    setBusy(true); setError(null); setReviewed(null);
    try {
      await timedTripRequest(`/api/v1/trips/${tripId}/days/${day.date}/notes`, "PUT",
        { day_id: dayId, notes: text, expected: { notes: expected } });
      await onSaved(text.trim() ? "Notes saved." : "Notes removed.");
    } catch (err) {
      const changed = err instanceof TripRequestError && err.status === 409;
      setError(errorMessage(err));
      setConflict(changed);
      if (changed) void onReload();
    } finally { setBusy(false); }
  };
  const review = async () => {
    setBusy(true); setError(null);
    try {
      const current = await timedTripRequest<TripFull>(`/api/v1/trips/${tripId}`, "GET");
      const saved = current.days.find((candidate) => candidate.date === day.date);
      if (!saved) throw new Error("This day isn't on the trip anymore. Reload the trip.");
      setDayId(saved.id); setExpected(saved.notes ?? null); setConflict(false);
      setReviewed({ notes: saved.notes ?? null });
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  };

  return (
    <form onSubmit={save} aria-labelledby={`${name}-title`} aria-busy={busy} className="space-y-3 border-t border-border pt-3">
      <h3 id={`${name}-title`} className="text-base font-semibold text-foreground">Notes for {dateLabel}</h3>
      {reviewed && <div role="status" className={noticeClass}>
        {reviewed.notes
          ? <>Saved now:<span className="mt-1 block whitespace-pre-wrap break-words">{reviewed.notes}</span></>
          : "Saved now: no notes."}
        <span className="mt-1 block">Your notes are still here; save to replace them.</span>
      </div>}
      {error && <p id={`${name}-error`} role="alert" className="text-base text-destructive">{error}</p>}
      <div className="min-w-0 space-y-1">
        <label htmlFor={`${name}-field`} className="block text-base text-foreground">Notes for everyone</label>
        {/* The server allows 2,000 characters (parseDayNotesEdit). */}
        <textarea ref={field} id={`${name}-field`} name="notes" rows={5} maxLength={2000} value={text} disabled={busy}
          onChange={(event) => { setText(event.target.value); setError(null); setDiscarding(false); }}
          className={cn(fieldClassName, "h-auto py-2")} aria-invalid={(!!error && !conflict) || undefined}
          aria-describedby={error ? `${name}-error ${name}-hint` : `${name}-hint`} />
        <p id={`${name}-hint`} className="text-sm text-muted-foreground">
          Tickets, rentals, parking, where to find each other. Clear the notes and save to remove them.
        </p>
      </div>
      {discarding ? (
        <div className="space-y-2">
          <p className="text-base text-foreground">Discard your changes to the notes?</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>Discard changes</Button>
            <Button ref={keepEditing} type="button" onClick={() => setDiscarding(false)}>Keep editing</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {conflict
            ? <Button type="button" loading={busy} onClick={() => void review()}>Review saved notes</Button>
            : <Button type="submit" loading={busy} disabled={!dirty}>{text.trim() || !expected ? "Save notes" : "Remove notes"}</Button>}
          <Button type="button" variant="outline" disabled={busy} onClick={() => dirty ? setDiscarding(true) : onCancel()}>Cancel</Button>
        </div>
      )}
      {busy && <p role="status" className="text-base text-muted-foreground">{conflict ? "Loading the saved notes…" : "Saving notes…"}</p>}
    </form>
  );
}
