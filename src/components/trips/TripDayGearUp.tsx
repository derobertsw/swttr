"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Shirt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/trips/trip-primitives";
import { useUserId } from "@/hooks/useUserId";
import { keepOutingForGearUp } from "@/lib/gearUpDraft";
import { RESUME_OUTING_PATH } from "@/lib/outingReturn";
import { fetchTripDayOuting, isTripDayResult, tripDayHref, tripDayLabel } from "@/lib/trip-day-gear-up";
import { errorMessage } from "@/lib/trip-requests";
import { forgetKitSaveFor } from "@/lib/tripKitSave";
import type { Outing } from "@/types/outing";
import type { GearUpTripDay, TripDayOuting } from "@/types/trip-day-outing";
import type { TripFull } from "@/types/trips";

const actionClassName = "inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary";

/**
 * Which trip day Gear up is planning layers for (#335), above the form or the
 * results, with the way back to it. Results for another outing, after Edit
 * outing changed its activity, place or date, aren't that day's any more:
 * it says so, and Save to trip then asks where to save them. Planning for
 * the day again, or without the trip, is an explicit choice.
 */
export function TripDayBar({ tripDay, shown, onPlanAgain, onLeave }: {
  tripDay: GearUpTripDay;
  /** The outing of the results on screen, or null on the form. */
  shown: Outing | null;
  onPlanAgain: () => void;
  onLeave: () => void;
}) {
  const { context } = tripDay;
  const detached = shown !== null && !isTripDayResult(tripDay, shown);
  return (
    <section aria-labelledby="trip-day-bar-heading" className="flex w-full flex-col gap-1 border-b border-border pb-3">
      <SectionLabel>Planning for your trip</SectionLabel>
      <h2 id="trip-day-bar-heading" className="break-words text-base font-semibold text-foreground">
        {context.trip_name} · {tripDayLabel(context)}
      </h2>
      {detached && (
        <p role="status" className="text-sm text-foreground">
          You changed the outing, so these layers aren&apos;t for this day any more. Save to trip asks where to save them.
        </p>
      )}
      <div className="flex flex-wrap gap-x-5">
        <Link href={tripDayHref(context)} className={actionClassName}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to trip day
        </Link>
        {detached && <button type="button" onClick={onPlanAgain} className={actionClassName}>Plan for the day again</button>}
        <button type="button" onClick={onLeave} className={actionClassName}>Plan without the trip</button>
      </div>
    </section>
  );
}

type DayOutingState =
  | { trip: TripFull; attempt: number; outing: TripDayOuting; error?: undefined }
  | { trip: TripFull; attempt: number; outing?: undefined; error: string };

/** The day's outing as it's loading, or loaded, or why it couldn't be, with a way to ask again. */
export interface TripDayOutingState {
  outing: TripDayOuting | null;
  error: string | null;
  loading: boolean;
  retry: () => void;
}

/**
 * The signed-in person's outing for the trip day from the server (#335):
 * what Plan my layers asks Gear up for, or why layers can't be planned. It's
 * asked for again whenever the trip is, so it follows the day's changes.
 */
export function useTripDayOuting(tripId: string, date: string, trip: TripFull | null, enabled: boolean): TripDayOutingState {
  const [state, setState] = useState<DayOutingState | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!trip || !enabled) return;
    const controller = new AbortController();
    fetchTripDayOuting(tripId, date, controller.signal)
      .then((outing) => setState({ trip, attempt, outing }))
      .catch((err) => { if (!controller.signal.aborted) setState({ trip, attempt, error: errorMessage(err) }); });
    return () => controller.abort();
  }, [tripId, date, trip, enabled, attempt]);
  const current = state && state.trip === trip && state.attempt === attempt ? state : null;
  return {
    outing: current?.outing ?? null,
    error: current?.error ?? null,
    loading: enabled && !!trip && !current,
    retry: useCallback(() => setAttempt((count) => count + 1), []),
  };
}

/**
 * Opens Gear up on the trip day's outing, asking for its layers right away,
 * with Save to trip saving them to this day (#335). A save of the same
 * outing earlier in the tab is forgotten, so the new layers offer to replace
 * the kit rather than show as saved.
 */
export function usePlanTripDay() {
  const router = useRouter();
  const userId = useUserId();
  return useCallback((day: TripDayOuting) => {
    if (!userId || day.status !== "ready" || !day.outing) return;
    forgetKitSaveFor(userId, day.outing);
    keepOutingForGearUp(userId, day.outing, day.context);
    router.push(RESUME_OUTING_PATH);
  }, [router, userId]);
}

/** Plan my layers, for a trip day whose layers can be planned in Gear up. */
export function PlanMyLayersButton({ day, variant = "default" }: { day: TripDayOuting; variant?: "default" | "outline" }) {
  const plan = usePlanTripDay();
  if (day.status !== "ready") return null;
  return (
    <Button type="button" variant={variant} className="self-start" onClick={() => plan(day)}>
      <Shirt aria-hidden="true" />
      Plan my layers
    </Button>
  );
}
