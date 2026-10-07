"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { format } from "date-fns";
import { CalendarPlus, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TripSheet, TripSheetDescription, TripSheetTitle } from "@/components/trips/TripSheet";
import { ACTIVITIES } from "@/data/activities";
import { EXERTION_LABELS } from "@/lib/biophysics/exertion";
import { BODY_PART_LABELS } from "@/lib/layers";
import { RESUME_SAVE_PATH, signInHref } from "@/lib/outingReturn";
import { errorMessage, TripRequestError, tripRequest } from "@/lib/trip-requests";
import { forgetKitSave, keepKitSave, readKitSave, type KitSaveOutcome } from "@/lib/tripKitSave";
import { useReturnFocus } from "@/hooks/useReturnFocus";
import { formatForecastTime } from "@/components/layers/ResultHeader";
import { useTemperatureUnit } from "@/components/TemperatureUnitProvider";
import { formatTemperature } from "@/lib/temperature";
import { cn } from "@/lib/utils";
import type { LayerChanges } from "@/types/plan";
import type { SavedOutfit, SaveKitConflict, SaveKitOptions, SaveKitPhaseChanges, SaveKitRequest, SaveKitResponse } from "@/types/savedKit";
import type { Trip } from "@/types/trips";

const NEW_TRIP = "new";

/** "Sat, Oct 10" for a "yyyy-MM-dd" date. */
function formatKitDate(date: string): string {
  return format(new Date(`${date}T00:00:00`), "EEE, MMM d");
}

function formatRange(start: string, end: string): string {
  return start === end ? formatKitDate(start) : `${formatKitDate(start)} – ${formatKitDate(end)}`;
}

/** Why general guidance isn't personalized, for someone deciding whether to save it. */
export function generalAdviceReason(outfit: SavedOutfit): string | null {
  if (outfit.advice.kind !== "general") return null;
  const activity = ACTIVITIES.find((option) => option.value === outfit.outing.activity)?.name ?? "This activity";
  switch (outfit.advice.reason) {
    case "unsupported": return `General guide for the temperature: ${activity} has no personalized model yet.`;
    case "no_gear": return "General guide for the temperature: your wardrobe had no usable gear for it.";
    case "auth_required": return "General guide for the temperature, not matched to your gear.";
    case "unavailable": return "General guide for the temperature: personalized layers weren't available.";
  }
}

interface SaveToTripProps {
  /** The outfit as shown, or null when there are no layers to save. */
  outfit: SavedOutfit | null;
  /** Opens as it appears, as after signing in to save. */
  defaultOpen?: boolean;
}

/**
 * Save to trip (#170): keeps the outfit as shown, with the outing and
 * forecast it was for, as the signed-in member's kit for that trip day, on a
 * trip they pick or a new one made from the outing. Guests sign in first and
 * come back to the outing. See docs/trip-saved-kits.md.
 */
export function SaveToTrip({ outfit, defaultOpen = false }: SaveToTripProps) {
  const [open, setOpen] = useState(defaultOpen && outfit !== null);
  // Each opening starts from the outfit shown then.
  const [opening, setOpening] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const focus = useReturnFocus();

  if (!outfit) return null;

  return (
    <>
      <Button
        ref={buttonRef}
        type="button"
        variant="outline"
        className="self-start"
        onClick={() => {
          focus.remember(() => buttonRef.current);
          setOpening((count) => count + 1);
          setOpen(true);
        }}
      >
        <CalendarPlus aria-hidden="true" />
        Save to trip
      </Button>
      <SaveToTripSheet
        key={opening}
        open={open}
        outfit={outfit}
        onClose={() => setOpen(false)}
        onCloseAutoFocus={(event) => {
          if (opening === 0) {
            // Opened by itself after sign-in: there's no opener to go back to.
            event.preventDefault();
            buttonRef.current?.focus({ preventScroll: true });
          } else {
            focus.restore(event);
          }
        }}
      />
    </>
  );
}

type Step =
  | { kind: "choose" }
  | { kind: "saving"; request: SaveKitRequest }
  | { kind: "conflict"; trip: Trip; conflicts: SaveKitConflict[]; request: SaveKitRequest }
  | { kind: "saved"; outcome: KitSaveOutcome }
  /** With a request, Retry repeats it; without, the person chooses again. */
  | { kind: "failed"; message: string; request: SaveKitRequest | null };

type OptionsState = { status: "loading" } | { status: "ready"; options: SaveKitOptions } | { status: "failed"; message: string };

function SaveToTripSheet({ open, outfit, onClose, onCloseAutoFocus }: {
  open: boolean;
  outfit: SavedOutfit;
  onClose: () => void;
  onCloseAutoFocus: (event: Event) => void;
}) {
  const { isLoaded, userId } = useAuth();
  // Where it can be saved depends only on the outing, which stays the same
  // while the sheet is open. The outfit itself is read when it's saved, so a
  // comfort check that finishes meanwhile is kept with it.
  const [optionsFor] = useState(outfit);
  const [optionsAttempt, setOptionsAttempt] = useState(0);
  const [optionsState, setOptionsState] = useState<OptionsState>({ status: "loading" });
  const [target, setTarget] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [step, setStep] = useState<Step>({ kind: "choose" });
  const inFlight = useRef(false);
  const signedIn = isLoaded && !!userId;
  const nameId = useId();

  // A save kept from before a reload: show its outcome, or offer to retry it.
  const [restored, setRestored] = useState<string | null>(null);
  if (signedIn && restored !== userId) {
    setRestored(userId);
    const kept = readKitSave(userId, outfit.outing);
    if (kept?.saved) setStep({ kind: "saved", outcome: kept.saved });
    else if (kept?.request) setStep({ kind: "failed", request: kept.request, message: "An earlier save may not have finished. Retry checks it without saving twice." });
  }

  useEffect(() => {
    if (!open || !signedIn) return;
    const controller = new AbortController();
    tripRequest<SaveKitOptions>("/api/v1/trips/kits/options", "POST", { outfit: optionsFor }, { signal: controller.signal })
      .then((options) => {
        setOptionsState({ status: "ready", options });
        // An existing trip is picked on purpose; with none that fit, a new one is the choice.
        setTarget((current) => current ?? (options.trips.some((trip) => trip.day_number !== null) ? null : NEW_TRIP));
      })
      .catch((err) => {
        if (!controller.signal.aborted) setOptionsState({ status: "failed", message: errorMessage(err) });
      });
    return () => controller.abort();
  }, [open, signedIn, optionsFor, optionsAttempt]);

  const send = useCallback(async (request: SaveKitRequest) => {
    if (!userId || inFlight.current) return;
    inFlight.current = true;
    // Kept before it's sent, so a reload or lost answer retries this same save.
    keepKitSave(userId, outfit.outing, { request });
    setStep({ kind: "saving", request });
    try {
      const result = await tripRequest<Extract<SaveKitResponse, { status: "saved" }>>("/api/v1/trips/kits", "POST", request);
      const outcome = { tripId: result.trip.id, tripName: result.trip.name, date: result.kits[0]?.date ?? "" };
      keepKitSave(userId, outfit.outing, { saved: outcome });
      setStep({ kind: "saved", outcome });
    } catch (err) {
      const details = err instanceof TripRequestError ? err.details : undefined;
      const status = err instanceof TripRequestError ? err.status : undefined;
      if (status === 409 && details?.status === "conflict") {
        // Nothing was saved; the same save can go ahead once a replacement is confirmed.
        keepKitSave(userId, outfit.outing, {});
        setStep({ kind: "conflict", trip: details.trip as Trip, conflicts: details.conflicts as SaveKitConflict[], request });
      } else if (status !== undefined && status >= 400 && status < 500) {
        // Repeating it won't help: choose again, as a new save.
        forgetKitSave();
        setStep({ kind: "failed", message: errorMessage(err), request: null });
      } else {
        setStep({ kind: "failed", message: `Couldn't save: ${errorMessage(err)}`, request });
      }
    } finally {
      inFlight.current = false;
    }
  }, [userId, outfit]);

  const options = optionsState.status === "ready" ? optionsState.options : null;
  const fittingTrips = options?.trips.filter((trip) => trip.day_number !== null) ?? [];
  const otherTrips = (options?.trips.length ?? 0) - fittingTrips.length;
  const tripName = name ?? options?.suggested_name ?? "";
  const canSave = !!options && (target === NEW_TRIP ? tripName.trim().length > 0 : fittingTrips.some((trip) => trip.id === target));

  const save = () => {
    if (!canSave || !target) return;
    void send({
      save_id: crypto.randomUUID(),
      target: target === NEW_TRIP
        ? { new_trip: { id: crypto.randomUUID(), name: tripName.trim() } }
        : { trip_id: target },
      outfit,
    });
  };

  const chooseAgain = () => {
    forgetKitSave();
    setStep({ kind: "choose" });
  };

  const busy = step.kind === "saving";
  const dateLabel = options ? formatKitDate(options.date) : null;

  let title = "Save to trip";
  let body: React.ReactNode;
  let footer: React.ReactNode;

  if (!isLoaded) {
    body = <Skeleton className="h-24 w-full rounded-card" />;
    footer = <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>;
  } else if (!userId) {
    body = (
      <TripSheetDescription>
        Sign in to keep these layers on a trip. You&apos;ll come back to this outing, and your layers are worked out again for your own gear before you save.
      </TripSheetDescription>
    );
    footer = (
      <>
        <Button asChild><Link href={signInHref(RESUME_SAVE_PATH)}>Sign in to save</Link></Button>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
      </>
    );
  } else if (step.kind === "saved") {
    title = "Saved to trip";
    body = (
      <div className="flex flex-col gap-2" role="status">
        <p className="flex items-center gap-2 text-base font-semibold text-foreground">
          <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden="true" />
          {step.outcome.tripName}
        </p>
        <TripSheetDescription>
          Your kit for {step.outcome.date ? formatKitDate(step.outcome.date) : "this day"} is saved as shown, with the forecast it was for. It changes only if you replace it.
        </TripSheetDescription>
      </div>
    );
    footer = (
      <>
        <Button asChild>
          <Link href={`/trips/${encodeURIComponent(step.outcome.tripId)}/days/${step.outcome.date}`}>Open trip day</Link>
        </Button>
        <Button type="button" variant="outline" onClick={chooseAgain}>Save again</Button>
      </>
    );
  } else if (step.kind === "conflict") {
    const conflict = step.conflicts[0];
    title = `Replace your kit for ${formatKitDate(conflict.date)}?`;
    body = (
      <div className="flex flex-col gap-3">
        <TripSheetDescription>
          {step.trip.name} already has your kit for this day. Nothing changes unless you replace it.
        </TripSheetDescription>
        <SavedKitSummary conflict={conflict} />
        <ChangeSummary changes={conflict.changes} outfit={outfit} />
      </div>
    );
    footer = (
      <>
        <Button
          type="button"
          onClick={() => void send({
            ...step.request,
            replace: Object.fromEntries(step.conflicts.map((c) => [c.date, c.kit.updated_at])),
          })}
        >
          Replace kit
        </Button>
        <Button type="button" variant="outline" onClick={() => { forgetKitSave(); onClose(); }}>Keep saved kit</Button>
      </>
    );
  } else if (step.kind === "saving") {
    body = (
      <div className="flex flex-col gap-3">
        <OutfitSummary outfit={outfit} dateLabel={dateLabel} />
        <p role="status" className="text-sm text-muted-foreground">Saving to the trip…</p>
      </div>
    );
    footer = <Button type="button" disabled loading>Saving…</Button>;
  } else if (step.kind === "failed") {
    body = (
      <div className="flex flex-col gap-3">
        <OutfitSummary outfit={outfit} dateLabel={dateLabel} />
        <p role="alert" className="text-sm font-medium text-destructive">{step.message}</p>
      </div>
    );
    const retry = step.request;
    footer = retry ? (
      <>
        <Button type="button" onClick={() => void send(retry)}>Retry save</Button>
        <Button type="button" variant="outline" onClick={chooseAgain}>Start over</Button>
      </>
    ) : (
      <>
        <Button type="button" onClick={chooseAgain}>Choose again</Button>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
      </>
    );
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <OutfitSummary outfit={outfit} dateLabel={dateLabel} />
        {optionsState.status === "loading" && <Skeleton className="h-28 w-full rounded-card" />}
        {optionsState.status === "failed" && (
          <div className="flex flex-col items-start gap-2">
            <p role="alert" className="text-sm font-medium text-destructive">Couldn&apos;t load your trips: {optionsState.message}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => { setOptionsState({ status: "loading" }); setOptionsAttempt((n) => n + 1); }}>
              Try again
            </Button>
          </div>
        )}
        {options && (
          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="mb-2 text-sm font-semibold text-foreground">Save to</legend>
            {fittingTrips.map((trip) => (
              <TargetOption key={trip.id} value={trip.id} checked={target === trip.id} onChange={setTarget}>
                <span className="block break-words font-semibold">{trip.name}</span>
                <span className="block text-sm text-muted-foreground">
                  Day {trip.day_number} · {formatRange(trip.start_date, trip.end_date)}
                  {trip.member_count > 1 && ` · ${trip.member_count} people`}
                </span>
              </TargetOption>
            ))}
            <TargetOption value={NEW_TRIP} checked={target === NEW_TRIP} onChange={setTarget}>
              <span className="block font-semibold">New trip</span>
              <span className="block text-sm text-muted-foreground">{dateLabel} at {options.destination}</span>
            </TargetOption>
            {target === NEW_TRIP && (
              <label htmlFor={nameId} className="mt-1 flex flex-col gap-2 text-sm font-medium">
                Trip name
                <Input id={nameId} required maxLength={200} value={tripName} onChange={(event) => setName(event.target.value)} />
              </label>
            )}
            {otherTrips > 0 && (
              <p className="text-sm text-muted-foreground">
                {otherTrips === 1 ? "1 of your trips doesn't" : `${otherTrips} of your trips don't`} include {dateLabel}.
              </p>
            )}
          </fieldset>
        )}
      </div>
    );
    footer = (
      <>
        <Button type="button" onClick={save} disabled={!canSave}>Save kit</Button>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
      </>
    );
  }

  return (
    <TripSheet
      open={open}
      onClose={onClose}
      busy={busy}
      className="sm:max-w-md"
      onCloseAutoFocus={onCloseAutoFocus}
      header={<TripSheetTitle>{title}</TripSheetTitle>}
      footer={footer}
      described={isLoaded && (!userId || step.kind === "saved" || step.kind === "conflict")}
    >
      {body}
    </TripSheet>
  );
}

function TargetOption({ value, checked, onChange, children }: {
  value: string; checked: boolean; onChange: (value: string) => void; children: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        "flex min-h-12 cursor-pointer items-start gap-3 rounded-control border border-border bg-card p-3 text-foreground",
        "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
        checked && "border-primary"
      )}
    >
      <input type="radio" name="save-target" value={value} checked={checked} onChange={() => onChange(value)} className="mt-1 size-4 shrink-0 accent-primary" />
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  );
}

/** The outing being saved: what, where, when, and how personal the advice is. */
function OutfitSummary({ outfit, dateLabel }: { outfit: SavedOutfit; dateLabel: string | null }) {
  const activity = ACTIVITIES.find((option) => option.value === outfit.outing.activity)?.name;
  const reason = generalAdviceReason(outfit);
  return (
    <div className="flex flex-col gap-1.5 rounded-control bg-muted p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-base font-semibold text-foreground">
          {activity} · {EXERTION_LABELS[outfit.outing.exertion]} effort
        </p>
        <Badge size="sm" variant={outfit.advice.kind === "personalized" ? "primary" : "neutral"}>
          {outfit.advice.kind === "personalized" ? "Personalized" : "General guide"}
        </Badge>
      </div>
      <p className="text-sm text-foreground">
        {outfit.weather.context?.place ?? outfit.outing.place.name}
        {dateLabel && <> · {dateLabel}</>}
      </p>
      {outfit.edited && <p className="text-sm text-muted-foreground">Includes your changes to the layers.</p>}
      {reason && <p className="text-sm text-muted-foreground">{reason}</p>}
    </div>
  );
}

/** The conditions an outfit was for: "18°F, wind 12 mph · forecast for Sat, Oct 10, 9:00 AM EDT". */
function Conditions({ weather }: { weather: SavedOutfit["weather"] }) {
  const { temperatureUnit } = useTemperatureUnit();
  const context = weather.context;
  return (
    <>
      {formatTemperature(weather.temperature, temperatureUnit)}, wind {weather.windSpeed} mph
      {context?.source === "forecast"
        ? ` · forecast for ${formatForecastTime(context.forecastTime, context.timeZone)}`
        : " · conditions then"}
    </>
  );
}

/** The kit a save would replace. */
function SavedKitSummary({ conflict }: { conflict: SaveKitConflict }) {
  const { kit } = conflict;
  if (!kit.outfit) {
    return (
      <div className="rounded-control bg-muted p-3 text-sm text-foreground">
        <p className="font-semibold">Your checklist</p>
        <p className="mt-0.5">{kit.items.length > 0 ? kit.items.join(", ") : "No items"}</p>
      </div>
    );
  }
  const activity = ACTIVITIES.find((option) => option.value === kit.outfit?.outing.activity)?.name;
  return (
    <div className="rounded-control bg-muted p-3 text-sm text-foreground">
      <p className="font-semibold">Saved kit{activity && ` · ${activity}`}</p>
      {kit.outfit_saved_at && (
        <p className="mt-0.5 text-muted-foreground">Saved {format(new Date(kit.outfit_saved_at), "MMM d, h:mm a")}</p>
      )}
      <p className="mt-0.5 text-muted-foreground">For <Conditions weather={kit.outfit.weather} /></p>
    </div>
  );
}

function describeItems(items: LayerChanges["add"]): string {
  return items.map((item) => `${item.name} (${BODY_PART_LABELS[item.bodyPart].toLowerCase()})`).join(", ");
}

/** "Adds:" for one outfit, "Climb adds:" or "Descent removes:" for a ski tour's phases. */
function changeLabel(phase: SaveKitPhaseChanges["phase"], change: "adds" | "removes"): string {
  return phase === "outing" ? `${change[0].toUpperCase()}${change.slice(1)}: ` : `${phase === "climb" ? "Climb" : "Descent"} ${change}: `;
}

/** What replacing the saved kit changes: the conditions, and the layers as worked out by the server. */
function ChangeSummary({ changes, outfit }: { changes: SaveKitPhaseChanges[] | null; outfit: SavedOutfit }) {
  const same = changes?.every((phase) => phase.add.length === 0 && phase.remove.length === 0);
  return (
    <div className="flex flex-col gap-1 text-sm">
      <p className="text-muted-foreground">These layers are for <Conditions weather={outfit.weather} />.</p>
      {!changes ? (
        <p className="text-muted-foreground">Replacing it swaps the checklist for these layers.</p>
      ) : same ? (
        <p className="text-muted-foreground">The layers are the same. Replacing it updates the outing and forecast they were saved for.</p>
      ) : (
        <dl className="flex flex-col gap-1">
          {changes.flatMap((phase) => [
            phase.add.length > 0 && (
              <div key={`${phase.phase}-add`}>
                <dt className="inline font-semibold text-foreground">{changeLabel(phase.phase, "adds")}</dt>
                <dd className="inline text-foreground">{describeItems(phase.add)}</dd>
              </div>
            ),
            phase.remove.length > 0 && (
              <div key={`${phase.phase}-remove`}>
                <dt className="inline font-semibold text-foreground">{changeLabel(phase.phase, "removes")}</dt>
                <dd className="inline text-foreground">{describeItems(phase.remove)}</dd>
              </div>
            ),
          ])}
        </dl>
      )}
    </div>
  );
}
