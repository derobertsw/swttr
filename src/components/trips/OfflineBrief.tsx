"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { sectionLabelClassName } from "@/components/trips/trip-primitives";
import { TripSheet, TripSheetDescription, TripSheetTitle } from "@/components/trips/TripSheet";
import { useUserId } from "@/hooks/useUserId";
import { useReturnFocus } from "@/hooks/useReturnFocus";
import {
  fetchOfflineBrief, readSavedBrief, removeSavedBrief, saveTicket, storeSavedBrief, type SavedBrief,
} from "@/lib/offline-briefs";
import { prepareOfflineOpening, SAVED_BRIEFS_PATH } from "@/lib/offline-shell";
import { errorMessage, TripRequestError } from "@/lib/trip-requests";
import { cn } from "@/lib/utils";
import type {
  OfflineBriefDay, OfflineBriefLink, OfflineBriefPlace, TripOfflineBrief, TripOfflineBriefResponse,
} from "@/types/trip-offline-brief";

/** "Sat, Feb 13, 6:12 PM EST": an absolute time on this device's clock. */
export const absoluteTime = (iso: string) => new Date(iso).toLocaleString(undefined, {
  weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
});

/** "Saved on this device Sat, Feb 13, 6:12 PM EST · Sat Feb 13 – Sun Feb 14" */
export const savedLine = (brief: TripOfflineBrief) => `Saved on this device ${absoluteTime(brief.saved_at)} · ${brief.covered.label}`;

export const savedBriefHref = (tripId: string) => `${SAVED_BRIEFS_PATH}?trip=${encodeURIComponent(tripId)}`;

const subscribeOnline = (onChange: () => void) => {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
};

/** Whether the browser says it has a network. "Yes" can still mean no internet, so requests handle failure too. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

type BriefCheck =
  | { state: "checking" }
  | { state: "current" }
  | { state: "changed" }
  /** The server says this person can't see the trip any more, or it's gone. */
  | { state: "gone" }
  /** Couldn't ask: offline, signed out, or the server failed. */
  | { state: "failed"; message: string; offline: boolean };

/**
 * Compares a saved copy with the trip online, by asking the server for the
 * same days again: the server says what changed, through `revision`.
 */
export function useBriefCheck(saved: SavedBrief | null, enabled: boolean): { check: BriefCheck | null; recheck: () => void } {
  const online = useOnline();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; check: BriefCheck } | null>(null);
  const key = saved ? `${saved.trip_id}:${saved.brief.revision}:${saved.brief.covered.dates.join(",")}:${attempt}` : null;
  useEffect(() => {
    if (!saved || !key || !enabled || !online) return;
    const controller = new AbortController();
    fetchOfflineBrief(saved.trip_id, saved.brief.covered.dates, controller.signal).then(
      ({ brief }) => setResult({ key, check: { state: brief.revision === saved.brief.revision ? "current" : "changed" } }),
      (error) => {
        if (controller.signal.aborted) return;
        if (error instanceof TripRequestError && error.status === 404 && error.message === "Not found") {
          setResult({ key, check: { state: "gone" } });
        } else if (error instanceof TripRequestError && error.status === 409) {
          setResult({ key, check: { state: "changed" } });
        } else {
          setResult({ key, check: { state: "failed", message: errorMessage(error), offline: !(error instanceof TripRequestError) } });
        }
      },
    );
    return () => controller.abort();
  }, [key, enabled, online, saved]);
  const recheck = useCallback(() => setAttempt((n) => n + 1), []);
  if (!saved || !enabled) return { check: null, recheck };
  if (!online) return { check: { state: "failed", message: "You're offline.", offline: true }, recheck };
  return { check: result?.key === key ? result.check : { state: "checking" }, recheck };
}

/** A saved copy's state in words: never a color alone. */
export function CheckStatus({ saved, check }: { saved: SavedBrief; check: BriefCheck | null }) {
  const since = absoluteTime(saved.brief.saved_at);
  const text = !check ? null
    : check.state === "checking" ? "Checking for changes…"
    : check.state === "current" ? "Matches the trip online."
    : check.state === "changed" ? "Trip changed — update saved copy"
    : check.state === "gone" ? "You're no longer on this trip, or it was deleted."
    : check.offline ? `Showing saved copy; changes since ${since} are unknown.`
    : `Couldn't check for changes: ${check.message} Showing saved copy; changes since ${since} are unknown.`;
  if (!text) return null;
  return <p className={cn("text-base", check?.state === "changed" ? "font-semibold text-foreground" : "text-muted-foreground")}>{text}</p>;
}

const linkClassName = "inline-flex min-h-11 items-center text-base font-semibold text-primary underline underline-offset-2";
const isWebUrl = (url: string) => /^https?:\/\//i.test(url);

/** A link out of the app, which says it needs a connection. */
function ExternalLink({ link }: { link: OfflineBriefLink }) {
  if (!isWebUrl(link.url)) return <span className="text-base text-foreground">{link.label}</span>;
  return <a href={link.url} rel="noopener noreferrer" className={linkClassName}>{link.label} · Requires connection</a>;
}

function Place({ place }: { place: OfflineBriefPlace }) {
  return <>
    <span className="block break-words">{place.label}</span>
    {place.address && <span className="block break-words text-muted-foreground">{place.address}</span>}
    <span className="block text-muted-foreground">{place.coordinates} · {place.precision_label}</span>
    {place.attribution && <span className="block text-sm text-muted-foreground">{place.attribution}</span>}
  </>;
}

const Row = ({ term, children }: { term: string; children: ReactNode }) =>
  <div><dt className="text-muted-foreground">{term}</dt><dd className="break-words text-foreground">{children}</dd></div>;

const Text = ({ value }: { value: string }) => <span className="whitespace-pre-wrap break-words">{value}</span>;

function DayBrief({ day }: { day: OfflineBriefDay }) {
  const headingId = `brief-day-${day.date}`;
  const plan = day.tour_plan;
  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-5 border-t border-border pt-6">
      <header>
        <p className={sectionLabelClassName}>{day.position_label}</p>
        <h2 id={headingId} className="mt-1 text-title font-semibold text-foreground">{day.date_label}</h2>
        <p className="mt-1 break-words text-base text-foreground">
          {day.activity_label ?? "Activity not set"}{day.destination && ` · ${day.destination}`}
        </p>
        {plan && <p className="break-words text-base text-foreground">Route: {plan.objective}</p>}
        {day.participation_note && <p className="mt-1 text-base text-muted-foreground">{day.participation_note}</p>}
      </header>

      {(day.meet || day.meeting_point || day.notes || day.starting_from) && (
        <section aria-labelledby={`${headingId}-start`}>
          <h3 id={`${headingId}-start`} className={sectionLabelClassName}>{day.meet ? "Meet and start" : "Start of the day"}</h3>
          <dl className="mt-2 space-y-2 text-base">
            {day.meet && <Row term="Meet">{day.meet.label}<span className="block text-sm text-muted-foreground">{day.meet.time_zone_label}</span></Row>}
            {day.meeting_point && <Row term="Meeting point"><Place place={day.meeting_point} /></Row>}
            {day.notes && <Row term="Notes"><Text value={day.notes} /></Row>}
            {day.starting_from?.yours && <Row term="Starting from">{day.starting_from.yours}</Row>}
            {day.starting_from?.crew && <Row term="Crew starting from">{day.starting_from.crew}</Row>}
          </dl>
        </section>
      )}

      {(day.getting_there || plan?.approach_notes) && (
        <section aria-labelledby={`${headingId}-drive`}>
          <h3 id={`${headingId}-drive`} className={sectionLabelClassName}>Getting there</h3>
          {day.getting_there && <dl className="mt-2 space-y-2 text-base">
            {(day.getting_there.from || day.getting_there.to) && <Row term="Drive">{[day.getting_there.from, day.getting_there.to].filter(Boolean).join(" → ")}</Row>}
            <Row term="Drive time">
              {day.getting_there.summary}
              {day.getting_there.detail && <span className="block text-sm text-muted-foreground">{day.getting_there.detail}</span>}
              {day.getting_there.credit && <span className="block text-sm text-muted-foreground">{day.getting_there.credit}</span>}
            </Row>
            {day.getting_there.closures.length > 0 && <Row term="Avoids">{day.getting_there.closures.join("; ")}</Row>}
          </dl>}
          {day.getting_there && day.getting_there.directions.length > 0 && <ul className="mt-1">
            {day.getting_there.directions.map((link) => <li key={link.url}><ExternalLink link={link} /></li>)}
          </ul>}
          {plan?.approach_notes && <dl className="mt-2 text-base"><Row term="Approach (ski or walk)"><Text value={plan.approach_notes} /></Row></dl>}
        </section>
      )}

      {day.tonight && (
        <section aria-labelledby={`${headingId}-tonight`}>
          <h3 id={`${headingId}-tonight`} className={sectionLabelClassName}>Tonight</h3>
          <dl className="mt-2 space-y-2 text-base">
            <Row term="Staying tonight">{day.tonight.yours}</Row>
            {day.tonight.moving && <Row term="Moving">{day.tonight.moving}</Row>}
            {day.tonight.crew && <Row term="Crew staying tonight">{day.tonight.crew}</Row>}
            {day.tonight.stay && <Row term={day.tonight.stay.name}>
              {day.tonight.stay.dates_label && <span className="block">{day.tonight.stay.dates_label}</span>}
              <span className="block text-muted-foreground">{day.tonight.stay.booking_label}</span>
              {day.tonight.stay.times_label && <span className="block text-muted-foreground">{day.tonight.stay.times_label}</span>}
              {day.tonight.stay.place ? <Place place={day.tonight.stay.place} /> : <span className="block text-muted-foreground">No location saved</span>}
            </Row>}
          </dl>
        </section>
      )}

      {plan && (
        <section aria-labelledby={`${headingId}-plan`}>
          <h3 id={`${headingId}-plan`} className="text-xl font-semibold text-foreground">Tour plan</h3>
          <dl className="mt-2 space-y-2 text-base">
            <Row term="Objective"><Text value={plan.objective} /></Row>
            {plan.metrics && <Row term="Figures">{plan.metrics}</Row>}
            {plan.access_notes && <Row term="Access"><Text value={plan.access_notes} /></Row>}
            {plan.backup_plan && <Row term="Backup plan"><Text value={plan.backup_plan} /></Row>}
            {plan.return_label && <Row term="Return">{plan.return_label}{plan.time_zone_label && <span className="block text-sm text-muted-foreground">{plan.time_zone_label}</span>}</Row>}
            {plan.checkin_notes && <Row term="Check-in"><Text value={plan.checkin_notes} /></Row>}
            {plan.pickup_notes && <Row term="Pickup"><Text value={plan.pickup_notes} /></Row>}
          </dl>
          {plan.links.length > 0 && <ul className="mt-1">{plan.links.map((link) => <li key={link.url + link.label}><ExternalLink link={link} /></li>)}</ul>}
          <p className="mt-1 text-sm text-muted-foreground">{plan.updated_label}</p>
        </section>
      )}

      {day.conditions.length > 0 && (
        <section aria-labelledby={`${headingId}-conditions`}>
          <h3 id={`${headingId}-conditions`} className="text-xl font-semibold text-foreground">Conditions</h3>
          <ul className="mt-2 space-y-4">
            {day.conditions.map((source) => (
              <li key={source.link.url + source.name} className="text-base">
                <p className="text-sm text-muted-foreground">{source.category_label}</p>
                <p className="break-words font-medium text-foreground">{source.name}{source.region && ` · ${source.region}`}</p>
                <ExternalLink link={source.link} />
                {source.your_review && <p className="text-muted-foreground">{source.your_review}</p>}
                {source.reviews.length > 0 && <ul className="mt-1 space-y-1">
                  {source.reviews.map((review) => <li key={review.who + review.label}>
                    <span className="text-foreground">{review.who}: {review.label}</span>
                    {review.stale && <span className="block text-sm text-foreground">{review.stale}</span>}
                    {review.note && <span className="block whitespace-pre-wrap break-words text-sm text-muted-foreground">“{review.note}”</span>}
                  </li>)}
                </ul>}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted-foreground">
            A review notes who looked at a source and when. It isn&apos;t a current forecast or a sign the plan is safe: check each source again when you have a connection.
          </p>
        </section>
      )}

      {day.kit && (
        <section aria-labelledby={`${headingId}-kit`}>
          <h3 id={`${headingId}-kit`} className="text-xl font-semibold text-foreground">My kit</h3>
          <p className="mt-1 text-base text-muted-foreground">{day.kit.summary}</p>
          {day.kit.kind === "outfit" && day.kit.parts.map((part) => (
            <div key={part.label} className="mt-2">
              {day.kit?.kind === "outfit" && day.kit.parts.length > 1 && <h4 className="text-base font-semibold text-foreground">{part.label}</h4>}
              <dl className="mt-1 space-y-1 text-base">
                {part.wear.map((area) => <Row key={area.area} term={area.area}>{area.items.join(", ")}</Row>)}
                {part.carry.length > 0 && <Row term="Carry">{part.carry.join(", ")}</Row>}
              </dl>
            </div>
          ))}
          {day.kit.kind === "checklist" && <p className="mt-1 text-base text-foreground">{day.kit.items.join(", ")}</p>}
        </section>
      )}

      {day.equipment.length > 0 && (
        <section aria-labelledby={`${headingId}-equipment`}>
          <h3 id={`${headingId}-equipment`} className="text-xl font-semibold text-foreground">My equipment</h3>
          <ul className="mt-2 divide-y divide-border border-y border-border">
            {day.equipment.map((item) => <li key={item.name} className="flex flex-wrap items-center justify-between gap-x-3 py-2 text-base">
              <span className="text-foreground">{item.name}{item.quantity > 1 && ` ×${item.quantity}`}</span>
              <span className="text-sm text-muted-foreground">{item.status_label}</span>
            </li>)}
          </ul>
          <p className="mt-1 text-sm text-muted-foreground">As your packing list was when saved.</p>
        </section>
      )}

      {day.day_checks.length > 0 && (
        <section aria-labelledby={`${headingId}-checks`}>
          <h3 id={`${headingId}-checks`} className={sectionLabelClassName}>Day checks</h3>
          <dl className="mt-2 space-y-2 text-base">
            {day.day_checks.map((check) => <Row key={check.label} term={check.label}>{check.status_label}</Row>)}
          </dl>
          <p className="mt-1 text-sm text-muted-foreground">Record checks in the trip when you have a connection.</p>
        </section>
      )}

      {day.missing.length > 0 && (
        <p className="text-base text-muted-foreground">Not planned yet for this day: {day.missing.join(", ")}.</p>
      )}
    </section>
  );
}

/** What a brief holds and doesn't, as lists: before saving, and in the saved copy. */
function BriefContents({ brief, headingLevel = 3 }: { brief: TripOfflineBrief; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const headingClass = headingLevel === 2 ? "text-xl font-semibold text-foreground" : "text-base font-semibold text-foreground";
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Heading className={headingClass}>Included</Heading>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-base text-foreground">
          {brief.contents.included.map((entry) => <li key={entry}>{entry}</li>)}
        </ul>
      </div>
      <div>
        <Heading className={headingClass}>Not available offline</Heading>
        {brief.contents.absent.length > 0 && <>
          <p className="mt-1 text-sm font-medium text-muted-foreground">Not planned yet for these days</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-base text-foreground">
            {brief.contents.absent.map((entry) => <li key={entry}>{entry}</li>)}
          </ul>
        </>}
        <p className="mt-2 text-sm font-medium text-muted-foreground">Never saved offline</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-base text-foreground">
          {brief.contents.omitted.map((entry) => <li key={entry}>{entry}</li>)}
        </ul>
      </div>
    </div>
  );
}

/**
 * A saved brief, read-only (#214): the trip, then each day in the day
 * brief's order, the crew's shared gear, and what the copy doesn't have.
 * `status` is the copy's state; `actions` its Update and Remove controls.
 */
export function OfflineBriefView({ brief, status, actions }: { brief: TripOfflineBrief; status: ReactNode; actions?: ReactNode }) {
  return (
    <article aria-labelledby="saved-brief-heading" className="flex w-full max-w-3xl min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className={sectionLabelClassName}>Saved on this device</p>
        <h1 id="saved-brief-heading" className="text-title font-semibold text-foreground wrap-anywhere md:text-title-lg">{brief.trip.name}</h1>
        <div role="status" aria-live="polite" className="flex flex-col gap-1">{status}</div>
        <p className="text-sm text-muted-foreground">A read-only copy. Links out of the app need a connection.</p>
        {actions}
      </header>

      {brief.days.map((day) => <DayBrief key={day.date} day={day} />)}

      {brief.shared_gear.length > 0 && (
        <section aria-labelledby="saved-brief-shared" className="border-t border-border pt-6">
          <h2 id="saved-brief-shared" className="text-xl font-semibold text-foreground">Shared gear</h2>
          <ul className="mt-2 divide-y divide-border border-y border-border">
            {brief.shared_gear.map((item, i) => <li key={`${item.description}-${i}`} className="py-2 text-base">
              <span className="block break-words text-foreground">{item.description}</span>
              <span className="block text-sm text-muted-foreground">{[item.assignee, item.status_label].filter(Boolean).join(" · ")}</span>
            </li>)}
          </ul>
        </section>
      )}

      <section aria-label="What this copy holds" className="border-t border-border pt-6">
        <BriefContents brief={brief} headingLevel={2} />
      </section>
    </article>
  );
}

type Opening = Awaited<ReturnType<typeof prepareOfflineOpening>>;
const OPENS_OFFLINE = "Open it from Trips, then Saved on this device, with or without a connection.";

/**
 * Save for offline on the trip's Plan page (#214): choose days, review what's
 * included and what isn't, then save. With a copy on this device it says when
 * it was saved, whether the trip changed since, and offers Open, Update and Remove.
 */
export function TripOfflineSave({ tripId }: { tripId: string }) {
  const userId = useUserId();
  const [saved, setSaved] = useState<SavedBrief | null | undefined>(undefined);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [working, setWorking] = useState<"update" | "remove" | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const focus = useReturnFocus();
  const { check, recheck } = useBriefCheck(saved ?? null, !!userId);

  useEffect(() => {
    if (!userId) return;
    let current = true;
    readSavedBrief(tripId, userId).then(
      (copy) => { if (current) setSaved(copy); },
      (err) => { if (current) { setSaved(null); setStorageError(errorMessage(err)); } },
    );
    return () => { current = false; };
  }, [tripId, userId]);

  // The server says this person can't open the trip any more: the copy goes
  // from the device once that's done. Any other failed check keeps it.
  const gone = check?.state === "gone" && saved ? saved : null;
  useEffect(() => {
    if (!gone) return;
    let current = true;
    removeSavedBrief(gone.trip_id).then(() => {
      if (!current) return;
      setSaved(null);
      setStatus("Removed from this device: you're no longer on this trip, or it was deleted.");
    }, (err) => { if (current) setError(`Couldn't remove the saved copy: ${errorMessage(err)}`); });
    return () => { current = false; };
  }, [gone]);

  if (!userId) return null;

  const update = async () => {
    if (!saved || working) return;
    setWorking("update"); setError(null); setStatus("");
    try {
      const ticket = await saveTicket();
      const { brief } = await fetchOfflineBrief(tripId, saved.brief.covered.dates);
      const stored = await storeSavedBrief(userId, brief, ticket);
      const opening = await prepareOfflineOpening();
      setSaved(stored);
      setStatus(`Updated. ${savedLine(stored.brief)}.${opening.ready ? ` ${OPENS_OFFLINE}` : ""}`);
      // The brief is kept, but the page that opens it offline isn't: that's a failure to say so.
      if (!opening.ready) setError(opening.reason);
    } catch (err) {
      setError(`Couldn't update the saved copy: ${errorMessage(err)} The copy saved ${absoluteTime(saved.brief.saved_at)} is still on this device.`);
      recheck();
    } finally {
      setWorking(null);
    }
  };

  const remove = async () => {
    if (!saved || working) return;
    setWorking("remove"); setError(null); setStatus("");
    try {
      await removeSavedBrief(tripId);
      setSaved(null);
      setStatus("Removed from this device. The trip online hasn't changed.");
      setTimeout(() => document.getElementById("offline-copy-heading")?.focus(), 0);
    } catch (err) {
      setError(`Couldn't remove the saved copy: ${errorMessage(err)}`);
    } finally {
      setWorking(null);
    }
  };

  const choose = () => {
    focus.remember(() => document.getElementById("offline-copy-heading"));
    setStatus(""); setError(null); setChoosing(true);
  };

  return (
    <section aria-labelledby="offline-copy-heading" className="flex min-w-0 flex-col gap-2">
      <h2 id="offline-copy-heading" tabIndex={-1} className="text-xl font-semibold text-foreground">Offline copy</h2>
      {saved === undefined ? (
        <p className="text-base text-muted-foreground">Checking this device…</p>
      ) : saved ? (
        <>
          <p className="text-base text-foreground">{savedLine(saved.brief)}</p>
          <CheckStatus saved={saved} check={check} />
          <div className="flex flex-wrap gap-2">
            <Button asChild><Link href={savedBriefHref(tripId)}>Open saved brief</Link></Button>
            <Button type="button" variant="outline" onClick={() => void update()} aria-busy={working === "update" || undefined} disabled={!!working}>
              {working === "update" ? "Updating saved copy…" : "Update saved copy"}
            </Button>
            <Button type="button" variant="outline" onClick={choose} disabled={!!working}>Change saved days</Button>
            <Button type="button" variant="ghost" onClick={() => void remove()} aria-busy={working === "remove" || undefined} disabled={!!working}>
              {working === "remove" ? "Removing…" : "Remove from this device"}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">Removing deletes only this device&apos;s copy. The trip stays online. Signing out removes saved copies too.</p>
        </>
      ) : (
        <>
          <p className="text-base text-muted-foreground">
            Keep a read-only brief of chosen days on this device for when there&apos;s no connection: the meet, where you start and sleep, tour plans and your kit. It changes only when you update it.
          </p>
          {storageError && <p className="text-base text-foreground">{storageError}</p>}
          <Button type="button" className="w-fit" onClick={choose}>Save for offline</Button>
        </>
      )}
      <p role="status" aria-live="polite" className="text-base text-foreground">{status}</p>
      {error && <p role="alert" className="text-base font-medium text-destructive">{error}</p>}
      {choosing && (
        <SaveOfflineSheet
          tripId={tripId}
          userId={userId}
          saved={saved ?? null}
          onClose={() => setChoosing(false)}
          onCloseAutoFocus={focus.restore}
          onSaved={(stored, opening) => {
            setSaved(stored);
            setChoosing(false);
            setStatus(`${savedLine(stored.brief)}.${opening.ready ? ` ${OPENS_OFFLINE}` : ""}`);
            if (!opening.ready) setError(opening.reason);
          }}
        />
      )}
    </section>
  );
}

/** Choose the days, see what's included and what isn't, then save. */
function SaveOfflineSheet({ tripId, userId, saved, onClose, onCloseAutoFocus, onSaved }: {
  tripId: string;
  userId: string;
  saved: SavedBrief | null;
  onClose: () => void;
  onCloseAutoFocus: (event: Event) => void;
  onSaved: (stored: SavedBrief, opening: Opening) => void;
}) {
  const [choices, setChoices] = useState<Omit<TripOfflineBriefResponse, "brief"> | null>(null);
  // Null until the trip's days arrive: then the saved copy's days that are still on the trip, or the default days.
  const [selected, setSelected] = useState<string[] | null>(null);
  // Days chosen before that the trip no longer has, said in words.
  const [notice, setNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ key: string; brief: TripOfflineBrief } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Reloads the trip's days, after its dates changed under the sheet.
  const [reload, setReload] = useState(0);
  const previewKey = useRef<string | null>(null);
  const chosen = useRef<string[] | null>(null);
  const key = selected?.join(",") ?? "";
  useEffect(() => { chosen.current = selected; }, [selected]);

  // The trip's days as they are now, always from the default brief, so days
  // the trip no longer has can't stop the sheet from offering the ones it does.
  useEffect(() => {
    const controller = new AbortController();
    fetchOfflineBrief(tripId, undefined, controller.signal).then((response) => {
      const onTrip = new Set(response.trip_days.map((day) => day.date));
      const wanted = chosen.current ?? saved?.brief.covered.dates ?? null;
      const kept = wanted?.filter((date) => onTrip.has(date)) ?? [];
      const gone = wanted?.filter((date) => !onTrip.has(date)) ?? [];
      const next = kept.length > 0 ? kept : response.brief.covered.dates;
      // The server's labels for the gone days: the saved copy's, or the days this sheet listed.
      const label = (date: string) => saved?.brief.days.find((day) => day.date === date)?.date_label
        ?? choices?.trip_days.find((day) => day.date === date)?.date_label ?? date;
      const names = gone.map(label).join(", ");
      setNotice(gone.length === 0 ? null : kept.length > 0
        ? `${names} ${gone.length === 1 ? "is" : "are"} no longer a day of this trip, so ${gone.length === 1 ? "it's" : "they're"} left out.`
        : `None of the saved days (${names}) are on the trip any more, so the trip's days ahead are chosen instead.`);
      setChoices({ trip_days: response.trip_days, default_dates: response.default_dates });
      setSelected(next);
      setPreviewError(null);
      if (next.join(",") === response.brief.covered.dates.join(",")) {
        previewKey.current = next.join(",");
        setPreview({ key: next.join(","), brief: response.brief });
      }
    }, (err) => {
      if (!controller.signal.aborted) setPreviewError(errorMessage(err));
    });
    return () => controller.abort();
    // `choices` only names gone days on a reload; reading it mustn't start one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, saved, reload]);

  // What the chosen days include, once they're known and whenever they change.
  useEffect(() => {
    if (!choices || !selected?.length || previewKey.current === key) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetchOfflineBrief(tripId, selected, controller.signal).then((response) => {
        previewKey.current = key;
        setPreview({ key, brief: response.brief });
        setPreviewError(null);
      }, (err) => {
        if (controller.signal.aborted) return;
        // The trip's dates changed since the sheet opened: list its days again.
        if (err instanceof TripRequestError && err.status === 409) setReload((n) => n + 1);
        else setPreviewError(errorMessage(err));
      });
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [tripId, key, selected, choices]);

  const toggle = (date: string) => setSelected((current) => {
    const next = new Set(current ?? []);
    if (next.has(date)) next.delete(date); else next.add(date);
    return [...next].sort();
  });

  const save = async () => {
    if (!selected?.length || saving) return;
    setSaving(true); setSaveError(null);
    try {
      const ticket = await saveTicket();
      const { brief } = await fetchOfflineBrief(tripId, selected);
      const stored = await storeSavedBrief(userId, brief, ticket);
      onSaved(stored, await prepareOfflineOpening());
    } catch (err) {
      const changed = err instanceof TripRequestError && err.status === 409;
      if (changed) setReload((n) => n + 1);
      setSaveError(`Couldn't save on this device: ${changed ? "The trip's days changed. Check the days and save again." : errorMessage(err)} ${saved ? `The copy saved ${absoluteTime(saved.brief.saved_at)} is still on this device.` : "Nothing was saved."}`);
    } finally {
      setSaving(false);
    }
  };

  const current = preview && preview.key === key ? preview.brief : null;
  return (
    <TripSheet
      open
      onClose={onClose}
      busy={saving}
      fullHeight
      onCloseAutoFocus={onCloseAutoFocus}
      header={<>
        <TripSheetTitle>Save for offline</TripSheetTitle>
        <TripSheetDescription>Choose the days to keep on this device. The copy is read-only and changes only when you update it.</TripSheetDescription>
      </>}
      footer={<>
        {saveError && <p role="alert" className="text-base font-medium text-destructive">{saveError}</p>}
        <Button type="button" onClick={() => void save()} disabled={!selected?.length} aria-busy={saving || undefined}>
          {saving ? "Saving on this device…" : "Save for offline"}
        </Button>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
      </>}
    >
      <div className="flex flex-col gap-5">
        <fieldset disabled={saving}>
          <legend className="text-base font-semibold text-foreground">Days</legend>
          {!choices ? (
            previewError ? <p role="alert" className="mt-2 text-base text-destructive">Couldn&apos;t load the trip&apos;s days: {previewError}</p>
              : <p className="mt-2 text-base text-muted-foreground">Loading the trip&apos;s days…</p>
          ) : (
            <ul className="mt-1 divide-y divide-border">
              {choices.trip_days.map((day) => (
                <li key={day.date}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 py-1 text-base text-foreground">
                    <input type="checkbox" className="size-5 accent-primary" checked={selected?.includes(day.date) ?? false} onChange={() => toggle(day.date)} />
                    <span>{day.date_label}{day.activity_label && <span className="text-muted-foreground"> · {day.activity_label}</span>}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {notice && <p role="status" className="mt-2 text-base text-foreground">{notice}</p>}
          {selected?.length === 0 && <p className="mt-1 text-base text-foreground">Choose at least one day.</p>}
        </fieldset>
        <div role="status" aria-live="polite">
          {selected?.length ? current ? null : previewError && choices
            ? <p className="text-base text-destructive">Couldn&apos;t list what&apos;s included: {previewError}</p>
            : <p className="text-base text-muted-foreground">Listing what&apos;s included…</p> : null}
        </div>
        {current && selected?.length ? <BriefContents brief={current} /> : null}
      </div>
    </TripSheet>
  );
}
