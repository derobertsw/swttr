"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input, fieldClassName } from "@/components/ui/input";
import { errorMessage, timedTripRequest, TripRequestError } from "@/lib/trip-requests";
import type { TripDay, TripFull } from "@/types/trips";

const noticeClass = "rounded-control border border-warning p-3 text-base text-foreground";

/** A day's meet time as an editor showed it: what a change expects to find. */
const seenMeet = (day: TripDay) => ({ meet_time: day.meet_time?.slice(0, 5) ?? null, meet_day_offset: day.meet_day_offset ?? 0 });

/**
 * The organizer's controls for a day's meet time (#333), for every sport,
 * under Meet and start: Set or Change opens the form, and Remove clears it.
 * Where the crew meets is the day's access point, in Getting there.
 */
export function DayMeetControls({ tripId, day, dateLabel, onSaved }: {
  tripId: string;
  day: TripDay;
  dateLabel: string;
  /** Reloads the trip. */
  onSaved: () => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const buttonId = `meet-time-${day.date}`;
  const focusSoon = () => setTimeout(() => document.getElementById(buttonId)?.focus(), 0);
  const close = (message?: string) => {
    setEditing(false);
    if (message) setStatus(message);
    focusSoon();
  };
  const remove = async () => {
    setWorking(true); setError(null); setStatus("");
    try {
      await timedTripRequest(`/api/v1/trips/${tripId}/days/${day.date}/meet`, "PUT",
        { day_id: day.id, meet_time: null, meet_day_offset: 0, expected: seenMeet(day) });
      setStatus("Meet time removed.");
      await onSaved();
      focusSoon();
    } catch (err) {
      setError(errorMessage(err));
      // The meet time changed since: show it as it is now.
      if (err instanceof TripRequestError && err.status === 409) await onSaved();
    } finally { setWorking(false); }
  };

  return <div className="mt-2">
    {editing ? (
      <MeetTimeEditor tripId={tripId} day={day} dateLabel={dateLabel} onCancel={() => close()}
        onSaved={async (message) => { await onSaved(); close(message); }} />
    ) : (
      <div className="flex flex-wrap gap-2">
        <Button id={buttonId} type="button" size="sm" variant="outline" onClick={() => { setEditing(true); setStatus(""); setError(null); }}>
          {day.meet_time ? "Change meet time" : "Set meet time"}
        </Button>
        {day.meet_time && <Button type="button" size="sm" variant="outline" disabled={working} onClick={() => void remove()}>Remove meet time</Button>}
      </div>
    )}
    <p aria-live="polite" className="text-sm text-success">{status}</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}

/**
 * A day's meet time on the destination's clock, on the day or the evening
 * before. A save the day no longer matches is refused (409); the time stays in
 * the form, and Review saved meet time shows what's saved before saving again.
 */
function MeetTimeEditor({ tripId, day, dateLabel, onCancel, onSaved }: {
  tripId: string;
  day: TripDay;
  dateLabel: string;
  onCancel: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const [time, setTime] = useState(day.meet_time?.slice(0, 5) ?? "");
  const [offset, setOffset] = useState(String(day.meet_day_offset ?? 0));
  // The day and its meet time as the editor showed them, until a review.
  const [dayId, setDayId] = useState(day.id);
  const [expected, setExpected] = useState(() => seenMeet(day));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [reviewed, setReviewed] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const name = `meet-time-form-${day.date}`;
  useEffect(() => {
    if (busy) return;
    (form.current?.elements.namedItem(errorField ?? "meet_time") as HTMLElement | null)?.focus();
  }, [busy, errorField]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!time || busy) return;
    setBusy(true); setError(null); setErrorField(null); setReviewed(null);
    try {
      await timedTripRequest(`/api/v1/trips/${tripId}/days/${day.date}/meet`, "PUT",
        { day_id: dayId, meet_time: time, meet_day_offset: Number(offset), expected });
      await onSaved("Meet time saved.");
    } catch (err) {
      setError(errorMessage(err));
      setConflict(err instanceof TripRequestError && err.status === 409);
      setErrorField(err instanceof TripRequestError && typeof err.details?.field === "string" ? err.details.field : null);
    } finally { setBusy(false); }
  };
  const review = async () => {
    setBusy(true); setError(null);
    try {
      const current = await timedTripRequest<TripFull>(`/api/v1/trips/${tripId}`, "GET");
      const saved = current.days.find((candidate) => candidate.date === day.date);
      if (!saved) throw new Error("This day isn't on the trip anymore. Reload the trip.");
      const label = current.meets?.find((entry) => entry.date === day.date)?.meet_label;
      setDayId(saved.id); setExpected(seenMeet(saved)); setConflict(false);
      setReviewed(`Saved now: ${label ? `meet ${label}` : "no meet time"}. Your time is still here; save to replace it.`);
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  };

  return (
    <form ref={form} onSubmit={save} aria-labelledby={`${name}-title`} aria-busy={busy} className="space-y-3 border-t border-border pt-3">
      <h3 id={`${name}-title`} className="text-base font-semibold text-foreground">Meet time for {dateLabel}</h3>
      <p className="text-sm text-muted-foreground">For everyone on the trip, on the destination&apos;s clock. The crew meets at the access point in Getting there.</p>
      {reviewed && <p role="status" className={noticeClass}>{reviewed}</p>}
      {error && <p id={`${name}-error`} role="alert" className="text-base text-destructive">{error}</p>}
      <fieldset disabled={busy} className="min-w-0">
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block min-w-0 space-y-1 text-base text-foreground">
            <span>Meet time (destination time)</span>
            <Input name="meet_time" type="time" required value={time}
              onChange={(event) => { setTime(event.target.value); setError(null); setErrorField(null); }}
              aria-invalid={errorField === "meet_time" || undefined} aria-describedby={errorField === "meet_time" ? `${name}-error` : undefined} />
          </label>
          <label className="block min-w-0 space-y-1 text-base text-foreground">
            <span>Meet on</span>
            <select name="meet_day_offset" value={offset} onChange={(event) => setOffset(event.target.value)} className={fieldClassName}
              aria-invalid={errorField === "meet_day_offset" || undefined}>
              <option value="0">{dateLabel}</option>
              <option value="-1">The day before</option>
            </select>
          </label>
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        {conflict
          ? <Button type="button" loading={busy} onClick={() => void review()}>Review saved meet time</Button>
          : <Button type="submit" loading={busy} disabled={!time}>Save meet time</Button>}
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button>
      </div>
      {busy && <p role="status" className="text-base text-muted-foreground">{conflict ? "Loading the saved meet time…" : "Saving meet time…"}</p>}
    </form>
  );
}
