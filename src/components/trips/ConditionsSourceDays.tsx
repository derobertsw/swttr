"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DayChecklist } from "@/components/trips/TripDaysEditor";
import { TripSheet, TripSheetDescription, TripSheetTitle } from "@/components/trips/TripSheet";
import { errorMessage, timedTripRequest, TripRequestError } from "@/lib/trip-requests";
import type { TripConditionsCategory, TripConditionsSourcePreview, TripConditionsSourceUse, TripDay, TripStop } from "@/types/trips";

const CATEGORY_LABEL: Record<TripConditionsCategory, string> = {
  avalanche: "Avalanche forecast", weather: "Mountain weather", access: "Access and closures",
};
const plural = (count: number) => `${count} ${count === 1 ? "day" : "days"}`;

export const isSourcePreview = (value: unknown): value is TripConditionsSourcePreview =>
  Array.isArray((value as TripConditionsSourcePreview | null)?.expected_days) && Array.isArray((value as TripConditionsSourcePreview).days);

/**
 * The server's review of a change to where a source applies (#211): what it
 * does, and each day it changes with what happens to the reviews there.
 */
export function SourceDaysReview({ heading, preview }: { heading: string; preview: TripConditionsSourcePreview }) {
  return (
    <section aria-labelledby="source-days-review" className="space-y-2">
      <h3 id="source-days-review" tabIndex={-1} className="font-semibold">{heading}</h3>
      <p className="break-words">{preview.summary}</p>
      <ul className="space-y-2">
        {preview.days.map((day) => (
          <li key={day.date} className="break-words">
            <p className="font-medium">{day.date_label}</p>
            {day.note && <p className="text-sm text-muted-foreground">{day.note}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Moves focus to the review's heading each time a review is shown, once it's on the page. */
export function useFocusReview(review: TripConditionsSourcePreview | null) {
  useEffect(() => { if (review) document.getElementById("source-days-review")?.focus(); }, [review]);
}

/**
 * Lists a source the trip already has on more days (#211). The organizer
 * picks the source, when there's a choice, and the days; the server reviews
 * which days get it and what happens to reviews there, and the save is
 * refused when the trip changed since. Reviews never come from another day.
 */
export function AttachSourceSheet({ tripId, date, title, choose, stops, days, sources, initialDates, onSaved, onClose, onCloseAutoFocus }: {
  tripId: string;
  title: string;
  /** Lists `sources` to pick from; otherwise the sheet is for its one source. */
  choose: boolean;
  /** The day the sheet opened from. */
  date: string;
  /** In position order, for each day's destination. */
  stops: TripStop[];
  days: TripDay[];
  /** The sources to choose from, or the one being listed. */
  sources: TripConditionsSourceUse[];
  initialDates: string[];
  onSaved: (message: string) => Promise<void>;
  onClose: () => void;
  onCloseAutoFocus: (event: Event) => void;
}) {
  const [open, setOpen] = useState(true);
  const [sourceId, setSourceId] = useState<string | null>(sources.length === 1 ? sources[0].id : null);
  const [selected, setSelected] = useState(initialDates);
  const [review, setReview] = useState<TripConditionsSourcePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useFocusReview(review);
  // One identity per review, so a retry of an uncertain save replays rather than saving twice.
  const mutationId = useRef<string | null>(null);
  const url = `/api/v1/trips/${tripId}/days/${date}/conditions`;

  const source = sources.find((candidate) => candidate.id === sourceId);
  // The days that don't list the chosen source yet.
  const available = source ? days.filter((day) => !source.dates.includes(day.date)) : [];
  const chosen = selected.filter((entry) => available.some((day) => day.date === entry)).sort();

  const loadReview = async () => {
    if (!source || chosen.length === 0 || busy) return;
    setBusy(true); setError(null);
    try {
      const preview = await timedTripRequest<unknown>(url, "POST", { action: "attach", preview: true, source_id: source.id, dates: chosen });
      if (!isSourcePreview(preview)) throw new Error("The review didn't load. Try again.");
      mutationId.current = null;
      setReview(preview);
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (!review || !source || busy) return;
    mutationId.current ??= crypto.randomUUID();
    setBusy(true); setError(null);
    try {
      await timedTripRequest(url, "POST", {
        action: "attach", source_id: review.source_id, expected_revision: review.revision, days: review.expected_days, mutation_id: mutationId.current,
      });
      await onSaved(`${source.name} added to ${plural(review.expected_days.length)}.`);
      setOpen(false);
    } catch (err) {
      // The trip changed since the review: show it as it is now, or go back to choosing.
      if (err instanceof TripRequestError && err.status === 409) {
        mutationId.current = null;
        setReview(isSourcePreview(err.details) ? err.details : null);
      }
      setError(errorMessage(err));
    } finally { setBusy(false); }
  };

  const listedOn = source && source.dates.length > 0
    ? `Already listed on ${source.dates.length === days.length ? "every day" : plural(source.dates.length)}.` : "Not listed on any day yet.";
  return (
    <TripSheet open={open} busy={busy && !!review} onClose={() => setOpen(false)} className="sm:max-w-xl"
      onCloseAutoFocus={(event) => { onCloseAutoFocus(event); onClose(); }}
      header={<>
        <TripSheetTitle>{title}</TripSheetTitle>
        <TripSheetDescription>Shared with the crew · Managed by the organizer. Nothing changes until you save.</TripSheetDescription>
      </>}
      footer={review ? <>
        <Button type="button" loading={busy} onClick={() => void save()}>List on {plural(review.expected_days.length)}</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => { setReview(null); setError(null); }}>Back</Button>
      </> : <>
        <Button type="button" loading={busy} disabled={!source || chosen.length === 0} onClick={() => void loadReview()}>
          Review{chosen.length > 0 ? ` ${plural(chosen.length)}` : ""}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
      </>}
    >
      <div className="space-y-4 text-base text-foreground">
        {error && <p role="alert" className="text-destructive">{error}</p>}
        {review ? (
          <SourceDaysReview heading={`Adds it to ${plural(review.days.length)}`} preview={review} />
        ) : (
          <>
            {choose && (
              <fieldset disabled={busy} className="space-y-2">
                <legend className="font-semibold">Source</legend>
                {sources.map((candidate) => (
                  <label key={candidate.id} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-control border border-border p-3 has-checked:border-primary">
                    <input type="radio" name="conditions-saved-source" value={candidate.id} checked={sourceId === candidate.id}
                      onChange={() => { setSourceId(candidate.id); setError(null); }} className="mt-1 size-5 shrink-0" />
                    <span className="min-w-0 break-words">
                      <span className="block">{candidate.name}</span>
                      <span className="block text-sm text-muted-foreground">
                        {CATEGORY_LABEL[candidate.category]}{candidate.region ? ` · ${candidate.region}` : ""} · {candidate.dates.length > 0 ? `On ${plural(candidate.dates.length)}` : "Not on any day"}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
            {source && (
              <div>
                <p className="font-semibold">Days</p>
                <p className="text-sm text-muted-foreground">{listedOn}</p>
                {available.length === 0
                  ? <p className="mt-2">It&apos;s listed on every day of the trip.</p>
                  : <DayChecklist legend="Days to list it on" stops={stops} days={available} selected={chosen} onChange={(dates) => { setSelected(dates); setError(null); }} />}
              </div>
            )}
            <p className="text-sm text-muted-foreground">Reviews stay with the day they were recorded for. Everyone records their own for each new day.</p>
          </>
        )}
        {busy && <p role="status" className="text-muted-foreground">{review ? "Saving…" : "Loading the review…"}</p>}
      </div>
    </TripSheet>
  );
}
