"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { TripSheet, TripSheetDescription, TripSheetTitle } from "@/components/trips/TripSheet";
import { errorMessage, timedTripRequest, TripRequestError } from "@/lib/trip-requests";
import type { TripItineraryOption, TripItineraryPreview, TripItineraryRequest } from "@/types/trips";

const isPreview = (value: unknown): value is TripItineraryPreview =>
  Array.isArray((value as TripItineraryPreview | null)?.options) && (value as TripItineraryPreview).options.length > 0;

function unchangedText({ changes, unchanged }: TripItineraryOption) {
  if (changes.length === 0) return "Every day keeps its destination and activity.";
  return unchanged === 1 ? "1 other day keeps its destination and activity." : `${unchanged} other days keep their destination and activity.`;
}

/**
 * Reviews a change to the shared itinerary before saving it: the server lists
 * each day it changes, before and after, with what happens to kits there, and
 * refuses a save that no longer matches the review. When the change can go
 * more than one way, nothing is chosen until the person picks an option.
 */
export function ItineraryChangeSheet({ tripId, change, title, description, question, saveLabel, onSaved, onClose, onCloseAutoFocus }: {
  tripId: string;
  change: TripItineraryRequest;
  title: string;
  description: string;
  /** The legend for the options, when there's more than one. */
  question: string;
  saveLabel: string;
  onSaved: () => void;
  onClose: () => void;
  onCloseAutoFocus: (event: Event) => void;
}) {
  // The sheet reviews the change it opened with.
  const [request] = useState(change);
  const [open, setOpen] = useState(true);
  const [preview, setPreview] = useState<TripItineraryPreview | null>(null);
  const [choice, setChoice] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const reviewRef = useRef<HTMLHeadingElement>(null);
  const url = `/api/v1/trips/${tripId}/itinerary`;

  useEffect(() => {
    let cancelled = false;
    timedTripRequest<TripItineraryPreview>(url, "POST", { ...request, preview: true })
      .then((result) => {
        if (!isPreview(result)) throw new Error("The review didn't load.");
        if (!cancelled) { setPreview(result); setError(null); }
      })
      .catch((err) => { if (!cancelled) setError(`Couldn't load the review: ${errorMessage(err)}`); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [url, request, attempt]);

  const options = preview?.options ?? [];
  const chosen: TripItineraryOption | undefined = options.length === 1 ? options[0] : options.find((option) => option.key === choice);

  const save = async () => {
    if (!chosen || busy) return;
    setBusy(true);
    setError(null);
    try {
      await timedTripRequest(url, "POST", { action: request.action, ...chosen.payload });
      setOpen(false);
      onSaved();
    } catch (err) {
      // The trip changed since this review: show the change as it is now, and
      // keep the choice if it's still there.
      if (err instanceof TripRequestError && err.status === 409) {
        if (isPreview(err.details)) {
          const current = err.details;
          setPreview(current);
          if (!current.options.some((option) => option.key === choice)) setChoice(null);
          setTimeout(() => (reviewRef.current ?? document.querySelector<HTMLInputElement>('input[name="itinerary-option"]'))?.focus(), 0);
        } else {
          setPreview(null);
        }
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
        <TripSheetTitle>{title}</TripSheetTitle>
        <TripSheetDescription>{description}</TripSheetDescription>
      </>}
      footer={<>
        {preview ? (
          <Button type="button" loading={busy} disabled={!chosen} onClick={() => void save()}>{saveLabel}</Button>
        ) : error ? (
          <Button type="button" onClick={() => { setBusy(true); setError(null); setAttempt((n) => n + 1); }}>Try again</Button>
        ) : null}
        <Button type="button" variant="outline" disabled={busy && !!preview} onClick={() => setOpen(false)}>Keep editing</Button>
      </>}
    >
      <div className="space-y-4 text-base text-foreground">
        {error && <p role="alert" className="text-destructive">{error}</p>}
        {!preview && busy && <p role="status" className="text-muted-foreground">Loading the review…</p>}
        {options.length > 1 && (
          <fieldset disabled={busy} className="space-y-2">
            <legend className="font-semibold">{question}</legend>
            {options.map((option) => (
              <label key={option.key} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-control border border-border p-3 has-checked:border-primary">
                <input type="radio" name="itinerary-option" value={option.key} checked={choice === option.key}
                  onChange={() => setChoice(option.key)} className="mt-1 size-5 shrink-0" />
                <span className="min-w-0 break-words">
                  <span className="block">{option.label}</span>
                  {option.detail && <span className="block text-muted-foreground">{option.detail}</span>}
                </span>
              </label>
            ))}
          </fieldset>
        )}
        {options.length === 1 && (
          <p className="break-words">
            <span className="block font-semibold">{options[0].label}</span>
            {options[0].detail && <span className="block text-muted-foreground">{options[0].detail}</span>}
          </p>
        )}
        {chosen && (
          <section aria-labelledby="itinerary-review" className="space-y-2">
            <h3 id="itinerary-review" ref={reviewRef} tabIndex={-1} className="font-semibold">
              {chosen.changes.length === 0 ? "No day changes" : chosen.changes.length === 1 ? "1 day changes" : `${chosen.changes.length} days change`}
            </h3>
            <ul className="space-y-2">
              {chosen.changes.map((day) => (
                <li key={day.date} className="break-words">
                  <p className="font-medium">{day.date_label}</p>
                  {day.before === day.after
                    ? <p>{day.after} <span className="text-muted-foreground">(unchanged)</span></p>
                    : <p><span className="text-muted-foreground">{day.before}</span> → {day.after}</p>}
                  {day.notes?.map((note) => <p key={note} className="text-sm text-muted-foreground">{note}</p>)}
                </li>
              ))}
            </ul>
            {chosen.unchanged > 0 && <p className="text-muted-foreground">{unchangedText(chosen)}</p>}
          </section>
        )}
      </div>
    </TripSheet>
  );
}
