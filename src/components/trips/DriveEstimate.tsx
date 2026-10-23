"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, fieldClassName } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { LocationPicker } from "@/components/trips/LocationPicker";
import { GEOAPIFY_CREDIT, OSM_CREDIT } from "@/lib/trip-location";
import { errorMessage, timedTripRequest, tripRequest, TripRequestError } from "@/lib/trip-requests";
import type { TripDay, TripDriveDay, TripDriveEstimates, TripDriveRoute, TripFull, TripLocation } from "@/types/trips";

const linkClass = "text-primary underline";

export interface DriveEstimatesState {
  estimates: TripDriveEstimates | null;
  /** Why the estimates couldn't load at all; a day's own failure is its state. */
  error: string | null;
  loading: boolean;
  /** A changed plan is loading; no old pair's duration is shown meanwhile. */
  routeChanged: boolean;
  /** Checking again for the same plan, after Retry or a change to your estimate; the last estimates still show. */
  refreshing: boolean;
  retry: () => void;
}

/**
 * The trip's drive estimates (#209), fetched again whenever a stay, night,
 * destination, access point or starting point changes. A response is kept
 * with the plan it was fetched for, so an older answer can never show
 * against a newer plan.
 */
export function useDriveEstimates(data: TripFull | null | undefined, enabled = true): DriveEstimatesState {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ tripId: string; plan: string; attempt: number; estimates: TripDriveEstimates | null; error: string | null } | null>(null);
  const plan = useMemo(() => data && JSON.stringify({
    trip: [data.trip.id, data.trip.start_date, data.trip.end_date, data.lodging?.revision],
    stops: data.stops.map((stop) => [stop.id, stop.access_point]),
    days: data.days.map((day) => [day.date, day.stop_id, day.access_point_stop_id, day.access_point, day.origin, day.origin_stay_id, day.no_drive]),
  }), [data]);
  const key = enabled && plan ? plan : null;
  const tripId = data?.trip.id;

  useEffect(() => {
    if (!key || !tripId) return;
    const controller = new AbortController();
    const requested = attempt;
    tripRequest<TripDriveEstimates>(`/api/v1/trips/${tripId}/drive-estimates`, "GET", undefined, { signal: controller.signal })
      .then((estimates) => { if (!controller.signal.aborted) setResult({ tripId, plan: key, attempt: requested, estimates, error: null }); })
      .catch((err) => { if (!controller.signal.aborted) setResult({ tripId, plan: key, attempt: requested, estimates: null, error: errorMessage(err) }); });
    return () => controller.abort();
  }, [key, tripId, attempt]);

  // Only an answer for this plan shows. Checking again keeps its estimates
  // meanwhile; after an error it loads from scratch.
  const current = result?.plan === key && (result.attempt === attempt || result.estimates) ? result : null;
  return {
    estimates: current?.estimates ?? null, error: current?.error ?? null,
    loading: !!key && !current, refreshing: !!current && current.attempt !== attempt,
    routeChanged: !!key && !!result && result.tripId === tripId && result.plan !== key,
    retry: () => setAttempt((n) => n + 1),
  };
}

const subscribeNever = () => () => {};
/** Apple Maps opens the Maps app on iPhone, iPad and Mac; Google Maps works everywhere else. */
function useAppleMaps(): boolean {
  return useSyncExternalStore(subscribeNever, () => /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent), () => false);
}

const calculatedLabel = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** "About 35 min drive · 14 mi · one way", or what's missing, in a few words for a list. */
export function driveSummary(day: TripDriveRoute, canEdit: boolean): string {
  const to = day.destination ? ` to ${day.destination.label}` : "";
  switch (day.state) {
    case "available": return `About ${day.estimate!.duration_label} drive${to} · ${day.estimate!.distance_label} · one way`;
    case "stale": return `About ${day.estimate!.duration_label} drive${to} · ${day.estimate!.distance_label} · one way · not updated`;
    case "manual": return `About ${day.manual!.duration_label} drive${to} · one way · ${canEdit ? "your" : "the organizer's"} estimate`;
    case "no_route": return `No road route${to}`;
    case "unavailable": return "Drive estimate unavailable";
    case "no_drive": return "No drive planned";
    case "missing_origin": return "Starting point not set";
    case "origin_not_located": return "Needs the stay's location";
    case "approximate_origin": return day.origin?.stay_id ? "Needs the stay's exact property" : "Needs the exact starting point";
    case "missing_access_point": return "Access point not set";
    case "approximate_access_point": return "Needs the exact entrance or parking";
    case "no_destination": return "No destination planned";
  }
}

/**
 * Opens maps for the exact endpoints while keeping the current day open. The
 * trip map names the access point in `label`: "Directions to Spruce Peak lot".
 */
export function Directions({ day, label }: { day: TripDriveRoute; label?: string }) {
  const apple = useAppleMaps();
  if (!day.directions || !day.origin || !day.destination) return null;
  const app = apple ? "Apple Maps" : "Google Maps";
  return (
    <Button asChild variant="outline" size="sm">
      <a href={apple ? day.directions.apple : day.directions.google} target="_blank" rel="noopener noreferrer"
        aria-label={label ? `${label} from ${day.origin.label} (opens ${app})` : `Directions from ${day.origin.label} to ${day.destination.label} (opens ${app})`}>
        {label ?? "Directions"}
      </a>
    </Button>
  );
}

/** Visible provider and map-data credits for the routing results shown. */
function RoutingAttribution() {
  return <p className="text-sm text-muted-foreground">
    <a href={GEOAPIFY_CREDIT.url} target="_blank" rel="noopener noreferrer" className={linkClass}>{GEOAPIFY_CREDIT.label}</a>
    {" · "}
    <a href={OSM_CREDIT.url} target="_blank" rel="noopener noreferrer" className={linkClass}>{OSM_CREDIT.label}</a>
  </p>;
}

/** Traffic assumptions and previous-route figures, separate from the current duration. */
function EstimateDetails({ day }: { day: TripDriveRoute }) {
  if (!day.estimate && !day.previous) return null;
  return (
    <details className="text-sm text-muted-foreground">
      <summary className="min-h-11 cursor-pointer py-2 text-base text-foreground">Estimate details</summary>
      <div className="space-y-1.5 break-words pb-2">
        {day.estimate && <p>Calculated {calculatedLabel(day.estimate.calculated_at)} from the starting point to the access point, by car.</p>}
        <p>Typical traffic, not live. No departure time is used. Check road conditions before you drive.</p>
        {day.closures.map((closure) => <p key={closure}>Avoids {closure}.</p>)}
        {day.previous && (
          <p>Earlier estimate, for {day.previous.origin_label} → {day.previous.destination_label}: about {day.previous.duration_label} · {day.previous.distance_label} (calculated {calculatedLabel(day.previous.calculated_at)}).</p>
        )}
      </div>
    </details>
  );
}

/** What to fix for a drive time, with where to fix it. */
function Missing({ title, children }: { title: string; children?: ReactNode }) {
  return <div><p className="text-base text-foreground">{title}</p>{children && <p className="text-sm text-muted-foreground">{children}</p>}</div>;
}

/** What an editor showed for each day: what a your-estimate change expects to find. */
const seenEstimates = (days: TripDriveDay[], dates: string[]) => dates.map((date) => {
  const manual = days.find((day) => day.date === date)?.manual;
  return { date, entered_at: manual?.entered_at ?? null, use_calculated: manual ? manual.use_calculated : null };
});
/** The day's starting point as an editor showed it. */
const seenOrigin = (day: TripDay | undefined) => ({ origin: day?.origin ?? null, origin_stay_id: day?.origin_stay_id ?? null, no_drive: day?.no_drive ?? false });
const listed = (items: string[]) => new Intl.ListFormat("en", { type: "conjunction" }).format(items);
const noticeClass = "rounded-control border border-warning p-3 text-base text-foreground";

/**
 * The drive part of the day's Getting there (#209): where the day starts →
 * the access point, the one-way estimate, Directions and Estimate details.
 * The organizer can start the day somewhere else, plan no drive, and add an
 * estimate of their own when routing has none. Only this row waits for the
 * estimate; the rest of the day shows.
 */
export function DayDrive({ data, date, dateLabel, drive, canEdit, onSaved }: {
  data: TripFull;
  date: string;
  dateLabel: string;
  drive: DriveEstimatesState;
  /** The organizer manages the starting point and their own estimate; everyone else reads them. */
  canEdit: boolean;
  /** Reloads the trip after the starting point changes. */
  onSaved: () => Promise<void> | void;
}) {
  const tripId = data.trip.id;
  const tripDay = data.days.find((candidate) => candidate.date === date);
  const crewStayId = data.lodging?.days.find((candidate) => candidate.date === date)?.starting_stay_id ?? null;
  const crewStay = data.lodging?.stays.find((stay) => stay.id === crewStayId);
  const day = drive.estimates?.days.find((candidate) => candidate.date === date);
  const [editing, setEditing] = useState<"origin" | "estimate" | "remove" | null>(null);
  // The drive as it was when your estimate's editor opened. The editor keeps
  // it, so a refresh that changes or removes the drive never drops an entry.
  const [opened, setOpened] = useState<{ day: TripDriveDay; days: TripDriveDay[] } | null>(null);
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const headingId = `drive-${date}`, originId = `starting-point-${date}`, estimateId = `your-estimate-${date}`;
  // The control, or the Drive heading when the card no longer has it, or the
  // Getting there heading once the day has no destination and no Drive row.
  const focusSoon = (id: string) => setTimeout(() => [id, headingId, `getting-there-${date}`]
    .map((candidate) => document.getElementById(candidate)).find(Boolean)?.focus(), 0);
  const stays = <Link href={`/trips/${tripId}/stays#trip-stays-heading`} className={linkClass}>Go to Stays</Link>;

  const open = (next: NonNullable<typeof editing>) => {
    setEditing(next); setStatus(""); setActionError(null);
    setOpened(day && drive.estimates ? { day, days: drive.estimates.days } : null);
  };
  const close = (focusId: string, message?: string) => {
    setEditing(null);
    if (message) setStatus(message);
    focusSoon(focusId);
  };
  /** A change made straight from the card, announced, with focus kept on the card. */
  const act = async (url: string, method: "PUT" | "PATCH", body: object, done: string, after: () => unknown, focusId: string) => {
    setWorking(true); setActionError(null); setStatus("");
    try {
      await timedTripRequest(url, method, body);
      setStatus(done);
      await after();
      focusSoon(focusId);
    } catch (err) {
      setActionError(errorMessage(err));
      // The day changed since: show it as it is now.
      if (err instanceof TripRequestError && err.status === 409) { await onSaved(); drive.retry(); }
    } finally { setWorking(false); }
  };
  const resetOrigin = () => act(`/api/v1/trips/${tripId}/days/${date}/origin`, "PUT",
    { origin: null, no_drive: tripDay?.no_drive ?? false, expected: seenOrigin(tripDay) },
    crewStay ? `Starting from ${crewStay.name} again.` : "Starting point removed.", onSaved, originId);
  const prefer = (useCalculated: boolean) => act(`/api/v1/trips/${tripId}/days/${date}/drive-estimate`, "PATCH",
    { use_calculated: useCalculated, expected: seenEstimates(drive.estimates?.days ?? [], [date]) },
    useCalculated ? "Using the calculated estimate." : "Using your estimate.", drive.retry, headingId);

  // "Starting from Ridge cabin · only this day · No drive planned"
  const startLine = day && (day.origin?.own || day.state === "no_drive") && (
    <p className="break-words text-base text-foreground">
      {day.origin ? `Starting from ${day.origin.label}${day.origin.own ? " · only this day" : ""}` : ""}
      {day.state === "no_drive" ? `${day.origin ? " · " : ""}No drive planned` : ""}
    </p>
  );
  let body: ReactNode = null;
  if (drive.loading) {
    body = <div role="status">
      <span className={drive.routeChanged ? "text-sm text-muted-foreground" : "sr-only"}>
        {drive.routeChanged ? "Route changed — updating estimate" : "Checking the drive time…"}
      </span>
      <Skeleton className="h-5 w-56 max-w-full" />
    </div>;
  } else if (drive.error || !day) {
    body = <div className="space-y-2">
      <p className="text-base text-foreground">Drive times couldn&apos;t load.</p>
      <Button type="button" size="sm" variant="outline" onClick={drive.retry}>Retry</Button>
    </div>;
  } else if (day.state === "no_destination") {
    // Nothing to drive to, so no Drive row, unless an editor is open: it keeps its entry.
    if (!editing) return null;
  } else if (day.state === "approximate_access_point" || day.state === "no_drive") {
    // The card already says what's missing about the access point.
    if (!startLine && !canEdit) return null;
    body = startLine;
  } else if (day.state === "missing_origin") {
    body = <Missing title="Choose where you're starting">
      No crew stay is set for {day.night_label} night{canEdit ? <>. Set a starting point for this day, or {stays} to assign one.</> : "."}
    </Missing>;
  } else if (day.state === "origin_not_located") {
    body = <div className="space-y-2">{startLine}<Missing title={`${day.origin?.label} has no location yet`}>
      {canEdit ? <>{stays} and set its location for a drive time, or change the starting point.</> : "The drive time appears once the organizer sets its location."}
    </Missing></div>;
  } else if (day.state === "approximate_origin") {
    body = <div className="space-y-2">{startLine}<Missing title={`${day.origin?.label} is an approximate area`}>
      {!canEdit ? "The drive time appears once the organizer sets the exact place."
        : day.origin?.stay_id ? <>{stays} and choose the exact property for a drive time, or change the starting point.</>
        : "Change the starting point to the exact place for a drive time."}
    </Missing></div>;
  } else if (day.state === "missing_access_point") {
    body = <div className="space-y-2">{startLine}<Missing title="Choose the entrance or parking">
      {canEdit ? "Set the access point for a drive time." : "The drive time appears once the organizer sets the access point."}
    </Missing></div>;
  } else {
    const yours = day.manual;
    const whose = canEdit ? "Your estimate" : "Organizer's estimate";
    const entered = (manual: NonNullable<typeof yours>) => `entered ${calculatedLabel(manual.entered_at)}${manual.note ? ` · ${manual.note}` : ""}`;
    const changed = day.state === "unavailable" && day.previous;
    body = <div className="space-y-2">
      {startLine}
      <p className="break-words text-sm text-muted-foreground">{day.origin?.label} → {day.destination?.label}</p>
      {day.state === "manual" && <>
        <p className="text-base font-medium text-foreground">About {yours!.duration_label} drive · one way</p>
        <p className="break-words text-sm text-muted-foreground">{whose} · {entered(yours!)}</p>
        {yours!.use_calculated && <p className="text-sm text-muted-foreground">
          The calculated estimate isn&apos;t available right now, so {canEdit ? "your" : "the organizer's"} estimate is shown.
        </p>}
      </>}
      {(day.state === "available" || day.state === "stale") && <p className="text-base font-medium text-foreground">
        About {day.estimate!.duration_label} drive · {day.estimate!.distance_label} · one way
      </p>}
      {(day.state === "available" || day.state === "stale") && <p className="text-sm text-muted-foreground">
        Calculated {day.estimate!.age_label} · <time dateTime={day.estimate!.calculated_at}>{calculatedLabel(day.estimate!.calculated_at)}</time>
      </p>}
      {day.state === "stale" && <p className="text-sm text-warning">Not updated: calculated {calculatedLabel(day.estimate!.calculated_at)}, and checking again failed.</p>}
      {day.state === "unavailable" && <p className="text-base text-foreground">{changed ? "Route changed — couldn't update the estimate" : "Drive estimate unavailable"}</p>}
      {day.state === "no_route" && <Missing title="No road route found">
        Check the access point, or plan the approach separately.
      </Missing>}
      {/* The other estimate for the same drive is kept, and offered separately. */}
      {day.state === "manual" && day.estimate && <div className="space-y-1">
        <p className="break-words text-sm text-foreground">Calculated estimate: about {day.estimate.duration_label} · {day.estimate.distance_label} · one way (calculated {day.estimate.age_label}){day.estimate.stale ? " · not updated" : ""}</p>
        {canEdit && <Button type="button" size="sm" variant="outline" disabled={working} onClick={() => void prefer(true)}>Use calculated estimate</Button>}
      </div>}
      {day.state !== "manual" && yours?.current && <div className="space-y-1">
        <p className="break-words text-sm text-foreground">{whose}: about {yours.duration_label} · {entered(yours)}</p>
        {canEdit && <Button type="button" size="sm" variant="outline" disabled={working} onClick={() => void prefer(false)}>Use your estimate</Button>}
      </div>}
      {canEdit && yours && !yours.current && <p className="break-words text-sm text-foreground">
        Your estimate, about {yours.duration_label}, was for {yours.origin_label} → {yours.destination_label}. Edit it to use it for this drive, or remove it.
      </p>}
      <div className="flex flex-wrap gap-2">
        <Directions day={day} />
        {(day.state === "unavailable" || day.state === "stale") && <Button type="button" size="sm" variant="outline" disabled={drive.refreshing} onClick={drive.retry}>Retry</Button>}
        {canEdit && !editing && !yours && (day.state === "unavailable" || day.state === "stale" || day.state === "no_route") && (
          <Button id={estimateId} type="button" size="sm" variant="outline" onClick={() => open("estimate")}>Add your estimate</Button>
        )}
        {canEdit && !editing && yours && <>
          <Button id={estimateId} type="button" size="sm" variant="outline" onClick={() => open("estimate")}>Edit your estimate</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => open("remove")}>Remove your estimate</Button>
        </>}
      </div>
      {drive.refreshing && <p className="text-sm text-muted-foreground">Checking the drive time…</p>}
      <EstimateDetails day={day} />
      {(day.estimate || day.previous || day.state === "no_route") && <RoutingAttribution />}
    </div>;
  }

  return (
    <section aria-labelledby={headingId} className="mt-3 border-t border-border pt-3">
      <h3 id={headingId} tabIndex={-1} className="text-sm font-medium text-muted-foreground">Drive</h3>
      <div aria-live="polite" className="mt-1">{body}</div>
      {editing === "estimate" && opened && (
        <YourEstimateEditor tripId={tripId} day={opened.day} days={opened.days}
          onCancel={() => close(estimateId)} onReviewed={drive.retry}
          onSaved={(message) => { drive.retry(); close(headingId, message); }} />
      )}
      {editing === "remove" && opened && (
        <RemoveYourEstimate tripId={tripId} day={opened.day} days={opened.days}
          onCancel={() => close(estimateId)} onConflict={drive.retry}
          onRemoved={() => { drive.retry(); close(headingId, "Your estimate removed."); }} />
      )}
      <p aria-live="polite" className="text-sm text-success">{status}</p>
      {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
      {canEdit && tripDay && (editing === "origin" ? (
        <StartingPointEditor data={data} day={tripDay} dateLabel={dateLabel} nightLabel={day?.night_label} crewStayId={crewStayId}
          onCancel={() => close(originId)}
          onSaved={async (message) => { await onSaved(); close(originId, message); }} />
      ) : day?.state !== "no_destination" && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button id={originId} type="button" size="sm" variant={day?.state === "missing_origin" ? "default" : "outline"} onClick={() => open("origin")}>
            {tripDay.origin || crewStay ? "Change starting point" : "Set starting point"}
          </Button>
          {tripDay.origin && <Button type="button" size="sm" variant="outline" disabled={working} onClick={() => void resetOrigin()}>
            {crewStay ? "Use crew stay again" : "Remove starting point"}
          </Button>}
        </div>
      ))}
    </section>
  );
}

/**
 * Where the day starts, for this day only: the crew stay of the night
 * before, another saved stay with a place, or any place. No drive planned
 * keeps the starting point and skips the estimate.
 */
function StartingPointEditor({ data, day, dateLabel, nightLabel, crewStayId, onCancel, onSaved }: {
  data: TripFull;
  day: TripDay;
  dateLabel: string;
  nightLabel: string | undefined;
  crewStayId: string | null;
  onCancel: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const stays = data.lodging?.stays ?? [];
  const crewStay = stays.find((stay) => stay.id === crewStayId);
  // Saved stays with a place. The crew stay has its own choice, unless the day
  // already starts from it as its own pick, which a lodging change must not undo.
  const picks = stays.filter((stay) => stay.location && (stay.id !== crewStayId || stay.id === day.origin_stay_id));
  const [initial] = useState(() => {
    if (!day.origin) return crewStay ? "crew" : "";
    return day.origin_stay_id && picks.some((stay) => stay.id === day.origin_stay_id) ? `stay:${day.origin_stay_id}` : "place";
  });
  const [choice, setChoice] = useState(initial);
  const [place, setPlace] = useState<TripLocation | null>(initial === "place" ? day.origin ?? null : null);
  const [noDrive, setNoDrive] = useState(day.no_drive ?? false);
  const [expected, setExpected] = useState(() => seenOrigin(day));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [reviewed, setReviewed] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const name = `starting-point-${day.date}`;
  useEffect(() => {
    const radios = [...form.current?.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`) ?? []];
    (radios.find((radio) => radio.checked) ?? radios[0])?.focus();
  }, [name]);

  const origin = choice === "crew" || choice === "" ? null : choice === "place" ? (place ? { location: place } : undefined) : { stay_id: choice.slice(5) };
  const ready = origin !== undefined && (choice !== "" || noDrive);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true); setError(null); setReviewed(null);
    try {
      await timedTripRequest(`/api/v1/trips/${data.trip.id}/days/${day.date}/origin`, "PUT", { origin, no_drive: noDrive, expected });
      await onSaved(noDrive ? "Starting point saved. No drive planned." : "Starting point saved.");
    } catch (err) {
      setError(errorMessage(err));
      setConflict(err instanceof TripRequestError && err.status === 409);
      if (err instanceof TripRequestError && err.details?.field === "origin") (form.current?.elements.namedItem("origin") as HTMLElement | null)?.focus();
    } finally { setBusy(false); }
  };
  const review = async () => {
    setBusy(true); setError(null);
    try {
      const current = await timedTripRequest<TripFull>(`/api/v1/trips/${data.trip.id}`, "GET");
      const saved = current.days.find((candidate) => candidate.date === day.date);
      if (!saved) throw new Error("This day isn't on the trip anymore. Reload the trip.");
      setExpected(seenOrigin(saved)); setConflict(false);
      setReviewed(`Saved now: ${saved.origin ? `starting from ${saved.origin.label}, only this day` : "starting from the crew stay"}${saved.no_drive ? ", with no drive planned" : ""}. Your choice is still here; save to replace it.`);
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  };
  const option = (value: string, label: string, detail: string) => (
    <label key={value} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-control border border-border p-3 has-checked:border-primary">
      <input type="radio" name={name} value={value} checked={choice === value} onChange={() => setChoice(value)} className="mt-1 size-5 shrink-0" />
      <span className="min-w-0 break-words"><span className="block text-base text-foreground">{label}</span><span className="block text-sm text-muted-foreground">{detail}</span></span>
    </label>
  );

  return (
    <form ref={form} onSubmit={save} aria-labelledby={`${name}-title`} aria-busy={busy} className="mt-3 space-y-3 border-t border-border pt-3">
      <h4 id={`${name}-title`} className="text-base font-semibold text-foreground">Starting point for {dateLabel}</h4>
      <p className="text-sm text-muted-foreground">Only this day. The crew stay and the other days don&apos;t change.</p>
      {reviewed && <p className={noticeClass}>{reviewed}</p>}
      {error && <p role="alert" className="text-base text-destructive">{error}</p>}
      <fieldset disabled={busy} className="min-w-0 space-y-3">
        <fieldset className="min-w-0 space-y-2">
          <legend className="text-base font-medium text-foreground">Start from</legend>
          {crewStay && option("crew", `Crew stay · ${crewStay.name}`, nightLabel ? `Where the crew stays ${nightLabel} night` : "Where the crew stays the night before")}
          {picks.map((stay) => option(`stay:${stay.id}`, stay.name, stay.id === crewStayId ? "This day's own · kept if the crew stay changes"
            : stay.location?.precision === "approximate" ? "Saved stay · approximate area" : "Saved stay"))}
          {option("place", "Another place", "Search for a place or enter coordinates")}
        </fieldset>
        {choice === "place" && <LocationPicker tripId={data.trip.id} heading="Where does the day start?" exactTarget="the exact place"
          value={place} name="origin" onChange={setPlace} />}
        <label className="flex min-h-11 cursor-pointer items-start gap-3">
          <input type="checkbox" name="no_drive" checked={noDrive} onChange={(event) => setNoDrive(event.target.checked)} className="mt-1 size-5 shrink-0" />
          <span className="min-w-0">
            <span className="block text-base text-foreground">No drive planned</span>
            <span className="block text-sm text-muted-foreground">The crew starts on foot or skis, or meets at the access point. The starting point is kept.</span>
          </span>
        </label>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        {conflict
          ? <Button type="button" loading={busy} onClick={() => void review()}>Review saved starting point</Button>
          : <Button type="submit" loading={busy} disabled={!ready}>Save starting point</Button>}
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button>
      </div>
      {busy && <p role="status" className="text-base text-muted-foreground">{conflict ? "Loading the saved starting point…" : "Saving starting point…"}</p>}
    </form>
  );
}

/**
 * Your own one-way drive time, for when routing has none. It's for the drive
 * shown, and can be saved for the other days with the same drive.
 */
function YourEstimateEditor({ tripId, day, days, onCancel, onSaved, onReviewed }: {
  tripId: string;
  day: TripDriveDay;
  days: TripDriveDay[];
  onCancel: () => void;
  onSaved: (message: string) => void;
  /** Fetches the estimates again after a conflict, so the card matches. */
  onReviewed: () => void;
}) {
  const saved = day.manual;
  const [seen, setSeen] = useState({ day, days });
  const [hours, setHours] = useState(saved ? String(Math.floor(saved.duration_seconds / 3600)) : "");
  const [minutes, setMinutes] = useState(saved ? String(Math.round((saved.duration_seconds % 3600) / 60)) : "");
  const [note, setNote] = useState(saved?.note ?? "");
  // The days it was saved for together stay ticked; unticking one removes it there.
  const together = (current: TripDriveDay) => current.manual?.current ? current.manual.dates : [current.date];
  const [ticked, setTicked] = useState(() => together(day));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [reviewed, setReviewed] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const id = `your-estimate-form-${day.date}`;
  useEffect(() => { (form.current?.elements.namedItem("hours") as HTMLElement | null)?.focus(); }, []);
  useEffect(() => {
    if (busy || !errorField) return;
    (form.current?.elements.namedItem(errorField === "duration" ? "hours" : errorField) as HTMLElement | null)?.focus();
  }, [busy, errorField]);

  const labelOf = (date: string) => seen.days.find((candidate) => candidate.date === date)?.date_label ?? date;
  const others = seen.day.same_drive_dates.filter((date) => date !== seen.day.date);
  const edit = () => { setError(null); setErrorField(null); };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !seen.day.pair_key) return;
    const seconds = Number(hours.trim() || 0) * 3600 + Number(minutes.trim() || 0) * 60;
    const dates = [seen.day.date, ...others.filter((date) => ticked.includes(date))];
    const clear = together(seen.day).filter((date) => !dates.includes(date));
    setBusy(true); edit(); setReviewed(null);
    try {
      await timedTripRequest(`/api/v1/trips/${tripId}/days/${seen.day.date}/drive-estimate`, "PUT", {
        pair_key: seen.day.pair_key, duration_seconds: Number.isFinite(seconds) ? seconds : null, note,
        dates, clear, expected: seenEstimates(seen.days, [...dates, ...clear]),
      });
      onSaved(dates.length > 1 ? `Your estimate saved for ${listed(dates.map(labelOf))}.` : "Your estimate saved.");
    } catch (err) {
      setError(errorMessage(err));
      setConflict(err instanceof TripRequestError && err.status === 409);
      setErrorField(err instanceof TripRequestError && typeof err.details?.field === "string" ? err.details.field : null);
    } finally { setBusy(false); }
  };
  const review = async () => {
    setBusy(true); edit();
    try {
      const current = await timedTripRequest<TripDriveEstimates>(`/api/v1/trips/${tripId}/drive-estimates`, "GET");
      const now = current.days.find((candidate) => candidate.date === seen.day.date);
      if (!now) throw new Error("This day isn't on the trip anymore. Reload the trip.");
      setSeen({ day: now, days: current.days }); setConflict(false);
      setReviewed(!now.pair_key ? "This day has no drive to estimate now. Cancel to see why."
        : now.pair_key !== seen.day.pair_key ? `The drive is now ${now.origin?.label} → ${now.destination?.label}. Your entry is still here; save to use it for this drive.`
        : now.manual?.current ? `Saved now: about ${now.manual.duration_label}${now.manual.note ? ` · ${now.manual.note}` : ""}. Your entry is still here; save to replace it.`
        : "There's no saved estimate for this day now. Your entry is still here; save to add it.");
      onReviewed();
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  };
  const field = (name: "hours" | "minutes" | "note", label: string, value: string, set: (value: string) => void, hint?: string) => (
    <div className="min-w-0 space-y-1">
      <label className="block space-y-1 text-base text-foreground">
        <span>{label}</span>
        <Input name={name} value={value} inputMode={name === "note" ? undefined : "numeric"} maxLength={name === "note" ? 200 : 4}
          onChange={(event) => { set(event.target.value); edit(); }} className={fieldClassName}
          aria-invalid={errorField === (name === "note" ? "note" : "duration") || undefined}
          aria-describedby={errorField === (name === "note" ? "note" : "duration") ? `${id}-error` : hint ? `${id}-${name}-hint` : undefined} />
      </label>
      {hint && <p id={`${id}-${name}-hint`} className="text-sm text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    <form ref={form} onSubmit={save} aria-labelledby={`${id}-title`} aria-busy={busy} className="mt-3 space-y-3 border-t border-border pt-3">
      <h4 id={`${id}-title`} className="text-base font-semibold text-foreground">{saved ? "Edit your estimate" : "Add your estimate"}</h4>
      <p className="break-words text-sm text-muted-foreground">{seen.day.origin?.label} → {seen.day.destination?.label} · by car, one way</p>
      {reviewed && <p className={noticeClass}>{reviewed}</p>}
      {error && <p id={`${id}-error`} role="alert" className="text-base text-destructive">{error}</p>}
      <fieldset disabled={busy} className="min-w-0 space-y-3">
        <fieldset className="min-w-0">
          <legend className="text-base text-foreground">Drive time</legend>
          <div className="mt-1 grid grid-cols-2 gap-3">
            {field("hours", "Hours", hours, setHours)}
            {field("minutes", "Minutes", minutes, setMinutes)}
          </div>
        </fieldset>
        {field("note", "Source or note (optional)", note, setNote, "Where the time comes from, like the resort's directions page or last season's drive.")}
        {others.length > 0 && <fieldset className="min-w-0 space-y-1">
          <legend className="text-base text-foreground">Use it for</legend>
          <p className="text-sm text-muted-foreground">Days with the same drive.</p>
          {seen.day.same_drive_dates.map((date) => {
            if (date === seen.day.date) {
              return <label key={date} className="flex min-h-11 items-start gap-3">
                <input type="checkbox" checked disabled className="mt-1 size-5 shrink-0" />
                <span className="text-base text-foreground">{labelOf(date)} (this day)</span>
              </label>;
            }
            const other = seen.days.find((candidate) => candidate.date === date)?.manual;
            const replaces = other?.current && !together(seen.day).includes(date) ? ` (replaces your estimate of ${other.duration_label})` : "";
            return <label key={date} className="flex min-h-11 cursor-pointer items-start gap-3">
              <input type="checkbox" checked={ticked.includes(date)} className="mt-1 size-5 shrink-0"
                onChange={(event) => setTicked((current) => event.target.checked ? [...current, date] : current.filter((candidate) => candidate !== date))} />
              <span className="text-base text-foreground">{labelOf(date)}{replaces}</span>
            </label>;
          })}
        </fieldset>}
      </fieldset>
      <div className="flex flex-wrap gap-2">
        {conflict
          ? <Button type="button" loading={busy} onClick={() => void review()}>Review saved estimate</Button>
          : <Button type="submit" loading={busy} disabled={!seen.day.pair_key}>Save your estimate</Button>}
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button>
      </div>
      {busy && <p role="status" className="text-base text-muted-foreground">{conflict ? "Loading the saved estimate…" : "Saving your estimate…"}</p>}
    </form>
  );
}

/**
 * Asks before removing your estimate from the day and the days that share it.
 * After a conflict, Review saved estimate shows what's saved now and removes
 * against that.
 */
function RemoveYourEstimate({ tripId, day, days, onCancel, onRemoved, onConflict }: {
  tripId: string;
  day: TripDriveDay;
  days: TripDriveDay[];
  onCancel: () => void;
  onRemoved: () => void;
  /** Fetches the estimates again after a conflict, so the card matches. */
  onConflict: () => void;
}) {
  const [seen, setSeen] = useState({ day, days });
  const saved = seen.day.manual;
  const dates = !saved ? [] : saved.current ? saved.dates : [seen.day.date];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const question = useRef<HTMLParagraphElement>(null);
  useEffect(() => question.current?.focus(), []);
  const labels = listed(dates.map((date) => seen.days.find((candidate) => candidate.date === date)?.date_label ?? date));
  const remove = async () => {
    setBusy(true); setError(null);
    try {
      await timedTripRequest(`/api/v1/trips/${tripId}/days/${seen.day.date}/drive-estimate`, "DELETE", { dates, expected: seenEstimates(seen.days, dates) });
      onRemoved();
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof TripRequestError && err.status === 409) { setConflict(true); onConflict(); }
    } finally { setBusy(false); }
  };
  const review = async () => {
    setBusy(true); setError(null);
    try {
      const current = await timedTripRequest<TripDriveEstimates>(`/api/v1/trips/${tripId}/drive-estimates`, "GET");
      const now = current.days.find((candidate) => candidate.date === seen.day.date);
      if (!now) throw new Error("This day isn't on the trip anymore. Reload the trip.");
      setSeen({ day: now, days: current.days }); setConflict(false); setReviewed(true);
      question.current?.focus();
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  };
  return (
    <div role="group" aria-labelledby={`remove-estimate-${day.date}`} className="mt-3 space-y-2 border-t border-border pt-3">
      <p id={`remove-estimate-${day.date}`} ref={question} tabIndex={-1} className="break-words text-base text-foreground">
        {!saved ? "There's no saved estimate for this day now."
          : <>{reviewed && `Saved now: about ${saved.duration_label}${saved.note ? ` · ${saved.note}` : ""}. `}Remove your estimate from {labels}? Any calculated estimate stays.</>}
      </p>
      {error && <p role="alert" className="text-base text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {conflict
          ? <Button type="button" loading={busy} onClick={() => void review()}>Review saved estimate</Button>
          : saved && <Button type="button" variant="destructive" loading={busy} onClick={() => void remove()}>Remove your estimate</Button>}
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>{saved ? "Keep it" : "Close"}</Button>
      </div>
      {busy && <p role="status" className="text-base text-muted-foreground">{conflict ? "Loading the saved estimate…" : "Removing your estimate…"}</p>}
    </div>
  );
}

/**
 * A stay's departures on Overview (#209): the next one in a line, and View
 * access times for every morning that starts there, each linking to its day.
 */
export function StayDepartures({ tripId, stayId, drive, canEdit = false }: { tripId: string; stayId: string; drive: DriveEstimatesState; canEdit?: boolean }) {
  const departures = drive.estimates?.stays.find((stay) => stay.stay_id === stayId);
  if (drive.loading) return <p role="status" className="mt-1 text-sm text-muted-foreground">Checking drive times…</p>;
  if (drive.error) return <div className="mt-1 flex flex-wrap items-center gap-2">
    <p className="text-sm text-muted-foreground">Drive times couldn&apos;t load.</p>
    <Button type="button" size="sm" variant="outline" onClick={drive.retry}>Retry</Button>
  </div>;
  if (!departures?.dates.length) return null;
  const dayOf = (date: string) => drive.estimates!.days.find((day) => day.date === date);
  const next = departures.next ? dayOf(departures.next) : undefined;
  const hasCalculated = departures.dates.some((date) => {
    const day = dayOf(date);
    return day?.estimate || day?.state === "no_route";
  });
  return (
    <div className="mt-1">
      {next && <p className="break-words text-base text-foreground">Next departure · {next.date_label}: {driveSummary(next, canEdit)}</p>}
      {next?.estimate && next.state !== "manual" && <p className="text-sm text-muted-foreground">Calculated {next.estimate.age_label}</p>}
      <details className="text-base text-foreground">
        <summary className="min-h-11 cursor-pointer py-2">View access times</summary>
        <ul className="space-y-1.5 break-words pb-2">
          {departures.dates.map((date) => {
            const day = dayOf(date);
            return day && <li key={date}>
              <Link href={`/trips/${tripId}/days/${date}`} className={linkClass}>{day.date_label}</Link>
              <span className="text-muted-foreground"> · {driveSummary(day, canEdit)}{day.estimate && day.state !== "manual" ? ` · calculated ${day.estimate.age_label}` : ""}</span>
            </li>;
          })}
        </ul>
      </details>
      {hasCalculated && <RoutingAttribution />}
    </div>
  );
}
