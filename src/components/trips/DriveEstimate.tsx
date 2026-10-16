"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { GEOAPIFY_CREDIT, OSM_CREDIT } from "@/lib/trip-location";
import { errorMessage, tripRequest } from "@/lib/trip-requests";
import type { TripDriveDay, TripDriveEstimates, TripFull } from "@/types/trips";

const linkClass = "text-primary underline";

export interface DriveEstimatesState {
  estimates: TripDriveEstimates | null;
  /** Why the estimates couldn't load at all; a day's own failure is its state. */
  error: string | null;
  loading: boolean;
  retry: () => void;
}

/**
 * The trip's drive estimates (#209), fetched again whenever a stay, night,
 * destination or access point changes. A response is kept with the plan it
 * was fetched for, so an older answer can never show against a newer plan.
 */
export function useDriveEstimates(data: TripFull | null | undefined, enabled = true): DriveEstimatesState {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; estimates: TripDriveEstimates | null; error: string | null } | null>(null);
  const plan = useMemo(() => data && JSON.stringify({
    trip: [data.trip.id, data.trip.start_date, data.trip.end_date, data.lodging?.revision],
    stops: data.stops.map((stop) => [stop.id, stop.access_point]),
    days: data.days.map((day) => [day.date, day.stop_id, day.access_point_stop_id, day.access_point]),
  }), [data]);
  const key = enabled && plan ? `${plan}:${attempt}` : null;
  const tripId = data?.trip.id;

  useEffect(() => {
    if (!key || !tripId) return;
    const controller = new AbortController();
    tripRequest<TripDriveEstimates>(`/api/v1/trips/${tripId}/drive-estimates`, "GET", undefined, { signal: controller.signal })
      .then((estimates) => { if (!controller.signal.aborted) setResult({ key, estimates, error: null }); })
      .catch((err) => { if (!controller.signal.aborted) setResult({ key, estimates: null, error: errorMessage(err) }); });
    return () => controller.abort();
  }, [key, tripId]);

  const current = result?.key === key ? result : null;
  return { estimates: current?.estimates ?? null, error: current?.error ?? null, loading: !!key && !current, retry: () => setAttempt((n) => n + 1) };
}

const subscribeNever = () => () => {};
/** Apple Maps opens the Maps app on iPhone, iPad and Mac; Google Maps works everywhere else. */
function useAppleMaps(): boolean {
  return useSyncExternalStore(subscribeNever, () => /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent), () => false);
}

const calculatedLabel = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** "About 35 min drive · 14 mi · one way", or what's missing, in a few words for a list. */
function driveSummary(day: TripDriveDay): string {
  const to = day.destination ? ` to ${day.destination.label}` : "";
  switch (day.state) {
    case "available": return `About ${day.estimate!.duration_label}${to} · ${day.estimate!.distance_label}`;
    case "stale": return `About ${day.estimate!.duration_label}${to} · ${day.estimate!.distance_label} · not updated`;
    case "no_route": return `No road route${to}`;
    case "unavailable": return "Drive estimate unavailable";
    case "missing_origin": return "Starting point not set";
    case "origin_not_located": return "Needs the stay's location";
    case "approximate_origin": return "Needs the stay's exact property";
    case "missing_access_point": return "Access point not set";
    case "approximate_access_point": return "Needs the exact entrance or parking";
    case "no_destination": return "No destination planned";
  }
}

function Directions({ day }: { day: TripDriveDay }) {
  const apple = useAppleMaps();
  if (!day.directions || !day.origin || !day.destination) return null;
  const app = apple ? "Apple Maps" : "Google Maps";
  return (
    <Button asChild variant="outline" size="sm">
      <a href={apple ? day.directions.apple : day.directions.google} target="_blank" rel="noopener noreferrer"
        aria-label={`Directions from ${day.origin.label} to ${day.destination.label} (opens ${app})`}>
        Directions
      </a>
    </Button>
  );
}

function EstimateDetails({ day }: { day: TripDriveDay }) {
  return (
    <details className="text-sm text-muted-foreground">
      <summary className="min-h-11 cursor-pointer py-2 text-base text-foreground">Estimate details</summary>
      <div className="space-y-1.5 break-words pb-2">
        {day.estimate && <p>Calculated {calculatedLabel(day.estimate.calculated_at)} for the stay to the access point, by car.</p>}
        <p>Typical traffic, not live. Check road conditions before you drive.</p>
        {day.closures.map((closure) => <p key={closure}>Avoids {closure}.</p>)}
        {day.previous && (
          <p>Earlier estimate, for {day.previous.origin_label} → {day.previous.destination_label}: about {day.previous.duration_label} · {day.previous.distance_label} (calculated {calculatedLabel(day.previous.calculated_at)}).</p>
        )}
        <p>
          <a href={GEOAPIFY_CREDIT.url} target="_blank" rel="noopener noreferrer" className={linkClass}>{GEOAPIFY_CREDIT.label}</a>
          {" · "}
          <a href={OSM_CREDIT.url} target="_blank" rel="noopener noreferrer" className={linkClass}>{OSM_CREDIT.label}</a>
        </p>
      </div>
    </details>
  );
}

/** What to fix for a drive time, with where to fix it. */
function Missing({ title, children }: { title: string; children?: ReactNode }) {
  return <div><p className="text-base text-foreground">{title}</p>{children && <p className="text-sm text-muted-foreground">{children}</p>}</div>;
}

/**
 * The drive part of the day's Getting there (#209): the stay of the night
 * before → the access point, the one-way estimate, Directions and Estimate
 * details. Only this row waits for the estimate; the rest of the day shows.
 */
export function DayDrive({ tripId, date, drive, canEdit }: { tripId: string; date: string; drive: DriveEstimatesState; canEdit: boolean }) {
  const day = drive.estimates?.days.find((candidate) => candidate.date === date);
  const stays = <Link href={`/trips/${tripId}#trip-stays-heading`} className={linkClass}>Go to Stays</Link>;
  let body: ReactNode = null;

  if (drive.loading) {
    body = <div role="status"><span className="sr-only">Checking the drive time…</span><Skeleton className="h-5 w-56" /></div>;
  } else if (drive.error || !day) {
    body = <div className="space-y-2">
      <p className="text-base text-foreground">Drive times couldn&apos;t load.</p>
      <Button type="button" size="sm" variant="outline" onClick={drive.retry}>Retry</Button>
    </div>;
  } else if (day.state === "no_destination" || day.state === "approximate_access_point") {
    // The card already says what's missing about the access point.
    return null;
  } else if (day.state === "missing_origin") {
    body = <Missing title="Choose where you're starting">
      No crew stay is set for {day.night_label} night{canEdit ? <>. {stays} to assign one.</> : "."}
    </Missing>;
  } else if (day.state === "origin_not_located") {
    body = <Missing title={`${day.origin?.label} has no location yet`}>
      {canEdit ? <>{stays} and set its location for a drive time.</> : "The drive time appears once the organizer sets its location."}
    </Missing>;
  } else if (day.state === "approximate_origin") {
    body = <Missing title={`${day.origin?.label} is an approximate area`}>
      {canEdit ? <>{stays} and choose the exact property for a drive time.</> : "The drive time appears once the organizer sets the exact property."}
    </Missing>;
  } else if (day.state === "missing_access_point") {
    body = <Missing title="Choose the entrance or parking">
      {canEdit ? "Set the access point for a drive time." : "The drive time appears once the organizer sets the access point."}
    </Missing>;
  } else {
    const changed = day.state === "unavailable" && day.previous;
    body = <div className="space-y-2">
      <p className="break-words text-sm text-muted-foreground">{day.origin?.label} → {day.destination?.label}</p>
      {(day.state === "available" || day.state === "stale") && <p className="text-base font-medium text-foreground">
        About {day.estimate!.duration_label} drive · {day.estimate!.distance_label} · one way
      </p>}
      {day.state === "stale" && <p className="text-sm text-warning">Not updated: calculated {calculatedLabel(day.estimate!.calculated_at)}, and checking again failed.</p>}
      {day.state === "unavailable" && <p className="text-base text-foreground">{changed ? "Route changed — couldn't update the estimate" : "Drive estimate unavailable"}</p>}
      {day.state === "no_route" && <Missing title="No road route found">
        Check the access point, or plan the approach separately.
      </Missing>}
      <div className="flex flex-wrap gap-2">
        <Directions day={day} />
        {(day.state === "unavailable" || day.state === "stale") && <Button type="button" size="sm" variant="outline" onClick={drive.retry}>Retry</Button>}
      </div>
      <EstimateDetails day={day} />
    </div>;
  }

  return (
    <section aria-labelledby={`drive-${date}`} className="mt-3 border-t border-border pt-3">
      <h3 id={`drive-${date}`} className="text-sm font-medium text-muted-foreground">Drive</h3>
      <div aria-live="polite" className="mt-1">{body}</div>
    </section>
  );
}

/**
 * A stay's departures on Overview (#209): the next one in a line, and View
 * access times for every morning that starts there, each linking to its day.
 */
export function StayDepartures({ tripId, stayId, drive }: { tripId: string; stayId: string; drive: DriveEstimatesState }) {
  const departures = drive.estimates?.stays.find((stay) => stay.stay_id === stayId);
  if (drive.loading) return <p role="status" className="mt-1 text-sm text-muted-foreground">Checking drive times…</p>;
  if (drive.error) return <div className="mt-1 flex flex-wrap items-center gap-2">
    <p className="text-sm text-muted-foreground">Drive times couldn&apos;t load.</p>
    <Button type="button" size="sm" variant="outline" onClick={drive.retry}>Retry</Button>
  </div>;
  if (!departures?.dates.length) return null;
  const dayOf = (date: string) => drive.estimates!.days.find((day) => day.date === date);
  const next = departures.next ? dayOf(departures.next) : undefined;
  return (
    <div className="mt-1">
      {next && <p className="break-words text-base text-foreground">Next departure · {next.date_label}: {driveSummary(next)}</p>}
      <details className="text-base text-foreground">
        <summary className="min-h-11 cursor-pointer py-2">View access times</summary>
        <ul className="space-y-1.5 break-words pb-2">
          {departures.dates.map((date) => {
            const day = dayOf(date);
            return day && <li key={date}>
              <Link href={`/trips/${tripId}/days/${date}`} className={linkClass}>{day.date_label}</Link>
              <span className="text-muted-foreground"> · {driveSummary(day)}</span>
            </li>;
          })}
        </ul>
      </details>
    </div>
  );
}
