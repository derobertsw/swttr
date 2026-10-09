"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { TripSheet, TripSheetDescription, TripSheetTitle } from "@/components/trips/TripSheet";
import { errorMessage, timedTripRequest, TripRequestError } from "@/lib/trip-requests";
import type { Trip, TripDateChangeDay, TripDateChangeMode, TripDateChangePreview } from "@/types/trips";

export interface TripDateChangeRequest {
  name?: string;
  start_date: string;
  end_date: string;
}

const MODES: Array<{ mode: TripDateChangeMode; label: string; detail: string }> = [
  { mode: "move", label: "Move the plan to the new dates", detail: "Each day keeps its destination, activity and kits." },
  { mode: "keep", label: "Keep plans on their calendar dates", detail: "Days outside the new dates are removed with their plans." },
];

/**
 * Reviews a change to the trip's dates before saving it: what moves, what's
 * added, what's removed with whose kits, and what happens to stays. The server
 * builds the review and refuses a save that no longer matches it.
 */
export function DateChangeSheet({ tripId, change, onSaved, onClose, onCloseAutoFocus }: {
  tripId: string;
  change: TripDateChangeRequest;
  onSaved: (trip: Trip) => void;
  onClose: () => void;
  onCloseAutoFocus: (event: Event) => void;
}) {
  // The sheet reviews the change it opened with.
  const [request] = useState(change);
  const [open, setOpen] = useState(true);
  const [preview, setPreview] = useState<TripDateChangePreview | null>(null);
  const [mode, setMode] = useState<TripDateChangeMode | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const reviewRef = useRef<HTMLHeadingElement>(null);
  const url = `/api/v1/trips/${tripId}`;

  useEffect(() => {
    let cancelled = false;
    timedTripRequest<TripDateChangePreview>(url, "PATCH", { ...request, preview: true })
      .then((result) => {
        if (!result?.plans?.keep) throw new Error("The review didn't load.");
        if (!cancelled) { setPreview(result); setError(null); }
      })
      .catch((err) => { if (!cancelled) setError(`Couldn't load the review: ${errorMessage(err)}`); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [url, request, attempt]);

  const plan = preview && (preview.plans.move ? mode && preview.plans[mode] : preview.plans.keep);
  const removing = plan ? plan.removed.length : 0;

  const save = async () => {
    if (!preview || !plan || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { trip } = await timedTripRequest<{ trip: Trip }>(url, "PATCH", {
        ...request, mode: plan.mode, lodging_revision: preview.lodging_revision, expected_removed: plan.expected_removed,
        from: { start_date: preview.from.start_date, end_date: preview.from.end_date },
      });
      setOpen(false);
      onSaved(trip);
    } catch (err) {
      // The trip changed since this review: show the change as it is now.
      if (err instanceof TripRequestError && err.status === 409 && err.details?.plans) {
        const current = err.details as unknown as TripDateChangePreview;
        setPreview(current);
        if (mode && !current.plans[mode]) setMode(null);
        setTimeout(() => reviewRef.current?.focus(), 0);
      }
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <TripSheet
      open={open}
      busy={busy && !!preview}
      onClose={() => setOpen(false)}
      className="sm:max-w-xl"
      onCloseAutoFocus={(event) => { onCloseAutoFocus(event); onClose(); }}
      header={<>
        <TripSheetTitle>Review date change</TripSheetTitle>
        <TripSheetDescription>{preview ? `${preview.from.label} → ${preview.to.label}` : "Checking each day's plan…"}</TripSheetDescription>
      </>}
      footer={<>
        {preview ? (
          <Button type="button" loading={busy} disabled={!plan} onClick={() => void save()}>
            {removing > 0 ? `Remove ${removing} ${removing === 1 ? "day" : "days"} and change dates` : "Change dates"}
          </Button>
        ) : error ? (
          <Button type="button" onClick={() => { setBusy(true); setError(null); setAttempt((n) => n + 1); }}>Try again</Button>
        ) : null}
        <Button type="button" variant="outline" disabled={busy && !!preview} onClick={() => setOpen(false)}>Keep editing</Button>
      </>}
    >
      <div className="space-y-4 text-base text-foreground">
        {error && <p role="alert" className="text-destructive">{error}</p>}
        {!preview && busy && <p role="status" className="text-muted-foreground">Loading the review…</p>}
        {preview?.plans.move && (
          <fieldset disabled={busy} className="space-y-2">
            <legend className="font-semibold">What happens to the day plans?</legend>
            {MODES.map((option) => (
              <label key={option.mode} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-control border border-border p-3 has-checked:border-primary">
                <input type="radio" name="date-change-mode" value={option.mode} checked={mode === option.mode}
                  onChange={() => setMode(option.mode)} className="mt-1 size-5 shrink-0" />
                <span><span className="block">{option.label}</span><span className="block text-muted-foreground">{option.detail}</span></span>
              </label>
            ))}
          </fieldset>
        )}
        {plan && (
          <section aria-labelledby="date-change-review" className="space-y-3">
            <h3 id="date-change-review" ref={reviewRef} tabIndex={-1} className="font-semibold">
              {plan.mode === "move" ? "Moving the plan" : "Keeping plans on their dates"}
            </h3>
            {plan.kept > 0 && <p>{plan.kept} {plan.kept === 1 ? "day keeps its" : "days keep their"} date and plan.</p>}
            <DayList title="Moved" days={plan.moved} describe={(day) => `${day.from_date_label} → ${day.date_label}`} />
            <DayList title="Removed, with their plans and kits" days={plan.removed} warning />
            <DayList title="Added" days={plan.added} />
          </section>
        )}
        {preview && preview.lodging_after.stays.length > 0 && (
          <section aria-labelledby="date-change-stays" className="space-y-2">
            <h3 id="date-change-stays" className="font-semibold">Stays</h3>
            <p>Stays keep their dates and bookings.</p>
            {preview.lodging_after.stays.map((stay) => (
              <div key={stay.id} className="break-words">
                <p>{stay.name} · {stay.date_label} · {stay.booking_status === "booked" ? "Booked" : "Not booked"}</p>
                {stay.review_dates.length > 0 && <p className="text-warning">Review nights outside the new dates: {stay.review_dates.join(", ")}</p>}
              </div>
            ))}
            <details>
              <summary className="min-h-11 cursor-pointer py-2">Starting points and stays after the change</summary>
              <ul className="space-y-1">
                {preview.lodging_after.days.map((day) => (
                  <li key={day.date} className="break-words">{day.date} · Starting from {day.starting_from} · Staying tonight {day.staying_tonight}</li>
                ))}
              </ul>
            </details>
          </section>
        )}
      </div>
    </TripSheet>
  );
}

function DayList({ title, days, describe = (day) => day.date_label, warning = false }: {
  title: string;
  days: TripDateChangeDay[];
  describe?: (day: TripDateChangeDay) => string;
  warning?: boolean;
}) {
  if (days.length === 0) return null;
  return (
    <div>
      <h4 className={warning ? "font-semibold text-warning" : "font-semibold"}>{title}</h4>
      <ul className="mt-1 space-y-2">
        {days.map((day) => (
          <li key={day.date} className="break-words">
            <p>{describe(day)} · {day.destination} · {day.activity ?? "No activity"}</p>
            {day.kits.length > 0 && <p className="text-muted-foreground">{day.kits.length === 1 ? "Kit" : "Kits"}: {day.kits.join(", ")}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
