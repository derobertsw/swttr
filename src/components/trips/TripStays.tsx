"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { segmentedGroupClassName, segmentedItemClassName } from "@/components/ui/segmented";
import { SectionLabel } from "@/components/trips/trip-primitives";
import { cn } from "@/lib/utils";
import { LocationSummary } from "@/components/trips/LocationPicker";
import { StayDepartures, useDriveEstimates } from "@/components/trips/DriveEstimate";
import { LodgingEditor, personNote, possessive, STAY_EXACT, type LodgingEditorTarget } from "@/components/trips/LodgingEditor";
import { useReturnFocus } from "@/hooks/useReturnFocus";
import type { TripFull, TripLodging, TripLodgingPerson, TripPersonRun, TripStaySummary } from "@/types/trips";

type Open = (target: LodgingEditorTarget) => void;

/** The nights a run covers, as the crew's night list has them. */
const runDates = (lodging: TripLodging, run: Pick<TripPersonRun, "start" | "nights">) => {
  const index = lodging.nights.findIndex((night) => night.date === run.start);
  return lodging.nights.slice(index, index + run.nights).map((night) => night.date);
};

/** Booking, nights and location as three separate facts, so none reads as another. */
const stayFacts = (stay: TripStaySummary) => [
  stay.booking_status === "booked" ? "Booked" : "Booking not confirmed",
  !stay.check_in && "Nights not set",
  stay.location?.precision === "exact" ? "Location set" : stay.location ? "Approximate location · Location needed for directions" : "Location needed for directions",
].filter(Boolean).join(" · ");

const occupantName = (people: TripLodgingPerson[], id: string) => {
  const person = people.find((candidate) => candidate.member_id === id);
  return person ? `${person.display_name}${person.membership === "invited" ? " (invitation pending)" : ""}` : "Someone who left";
};

/**
 * The Stays section (#207, #332): each person's nights, the crew's by person
 * and night, and the stays themselves. Members read; the organizer edits.
 */
export function TripStays({ data, canEdit, onSaved, viewerMemberId = null }: {
  data: TripFull; canEdit: boolean; onSaved: () => Promise<void>;
  /** The signed-in person's trip member id, for My stays. */
  viewerMemberId?: string | null;
}) {
  const [editor, setEditor] = useState<LodgingEditorTarget | null>(null);
  const [status, setStatus] = useState("");
  const focus = useReturnFocus();
  const lodging = data.lodging;
  const perMember = !!lodging?.per_member;
  const people = (lodging?.people ?? []).filter((person) => person.membership !== "left");
  const me = people.find((person) => person.member_id === viewerMemberId);
  const myStays = new Set(me?.runs.flatMap((run) => run.stay_id ? [run.stay_id] : []));
  // Members start with their own nights, unless a link names a stay they aren't in.
  const [hash] = useState(() => typeof window === "undefined" ? "" : window.location.hash);
  const linkedElsewhere = !!lodging?.stays.some((stay) => `#stay-${encodeURIComponent(stay.id)}` === hash && !myStays.has(stay.id));
  const [chosenView, setView] = useState<"mine" | "everyone" | null>(null);
  const mine = !!me && (chosenView ?? (canEdit || linkedElsewhere ? "everyone" : "mine")) === "mine";
  const shown = (lodging?.stays ?? []).filter((stay) => !mine || myStays.has(stay.id));
  const restoredHash = useRef(false);
  useEffect(() => {
    if (restoredHash.current) return;
    const stay = lodging?.stays.find((candidate) => `#stay-${encodeURIComponent(candidate.id)}` === window.location.hash);
    const article = stay && document.getElementById(`stay-${stay.id}`);
    if (!article) return;
    // Cold links can resolve before the async lodging rows exist.
    restoredHash.current = true;
    article.scrollIntoView({ block: "start", behavior: "instant" });
  }, [lodging, mine]);
  // A stay has departures once it has nights or a day starts from it as its
  // own starting point; until then each call would only cost provider credits.
  const departs = (stay: { id: string; assigned_nights: string[] }) =>
    stay.assigned_nights.length > 0 || data.days.some((day) => day.origin_stay_id === stay.id);
  const drive = useDriveEstimates(data, !!lodging?.stays.some(departs));
  const open: Open = (next) => {
    focus.remember(() => document.getElementById("trip-stays-heading"));
    setEditor(next);
  };
  return (
    <section aria-labelledby="trip-stays-heading" className="@container min-w-0">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 id="trip-stays-heading" tabIndex={-1} className="text-title font-semibold text-foreground md:text-title-lg">Stays</h1>
          {canEdit && <Button type="button" variant="outline" onClick={() => open({ action: "save" })}>Add stay</Button>}
        </div>
        <p className="mt-1 text-base text-muted-foreground">{perMember ? "Who's staying where, night by night" : "Crew stay · One shared place each night"}</p>
        {!canEdit && <p className="mt-1 text-base text-muted-foreground">Managed by the organizer</p>}
        <p aria-live="polite" className="text-sm text-success">{status}</p>
        {me && !!lodging?.stays.length && <div role="group" aria-label="Show stays for" className={cn(segmentedGroupClassName, "mt-3 grid-cols-2 sm:max-w-xs")}>
          <button type="button" aria-pressed={mine} onClick={() => setView("mine")} className={segmentedItemClassName}>My stays</button>
          <button type="button" aria-pressed={!mine} onClick={() => setView("everyone")} className={segmentedItemClassName}>Everyone</button>
        </div>}
      </div>
      {mine && lodging ? <MyNights person={me} lodging={lodging} canEdit={canEdit && perMember} open={open} />
        : lodging && people.length > 0 && !!lodging.stays.length && <PeopleByNight className="mt-6 hidden @3xl:block" lodging={lodging} people={people}
          viewerMemberId={viewerMemberId} canEdit={canEdit && perMember} open={open} />}
      <div className="max-w-3xl">
        {!(lodging?.stays.length) && <p className="mt-3 text-base text-muted-foreground">No stays saved yet. Accommodation can be planned later.</p>}
        {!!shown.length && <h2 className="mt-6 text-lg font-semibold text-foreground">{mine ? "Where you're staying" : "Properties"}</h2>}
        {mine && !shown.length && !!lodging?.stays.length && <p className="mt-3 text-base text-muted-foreground">You aren&apos;t staying anywhere on this trip yet.</p>}
        <div className="mt-1 divide-y divide-border border-y border-border empty:border-y-0">
          {shown.map((stay) => <StayArticle key={stay.id} stay={stay} people={people} canEdit={canEdit} perMember={perMember} open={open}
            departures={departs(stay) && <StayDepartures tripId={data.trip.id} stayId={stay.id} drive={drive} canEdit={canEdit} />} />)}
        </div>
        {!mine && perMember && lodging && <NightsWithoutStay people={people} lodging={lodging} canEdit={canEdit} open={open} />}
        {!perMember && !!lodging?.nights.length && <details className="mt-3 text-foreground">
          <summary className="min-h-11 cursor-pointer py-2 text-base">Crew nights</summary>
          <ul className="divide-y divide-border">
            {lodging.nights.map((night) => <li key={night.date} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0 break-words text-base"><p>{night.date_label}{night.pre_trip ? " · Pre-trip night" : ""}</p><p className="text-muted-foreground">{night.label}</p></div>
              {canEdit && <Button type="button" variant="outline" onClick={() => open({ action: "night", date: night.date })} aria-label={`Change night ${night.date_label}`}>Change</Button>}
            </li>)}
          </ul>
        </details>}
      </div>
      {editor && <LodgingEditor key={`${editor.action}:${editor.stay?.id ?? editor.date ?? editor.memberId ?? "new"}`} editor={editor} data={data}
        onClose={() => setEditor(null)} onCloseAutoFocus={focus.restore} onSaved={async (message) => {
          setStatus(message);
          await onSaved();
        }} />}
    </section>
  );
}

/** One person's nights in order, with the mornings they change stays. */
function MyNights({ person, lodging, canEdit, open }: { person: TripLodgingPerson; lodging: TripLodging; canEdit: boolean; open: Open }) {
  // The night before the trip and the last night are planned only by choice.
  const runs = person.runs.filter((run) => run.state === "assigned" || run.state === "no_stay" || run.gap);
  return <section aria-labelledby="my-nights-heading" className="mt-6 max-w-3xl">
    <h2 id="my-nights-heading" className="text-lg font-semibold text-foreground">Your nights</h2>
    {person.attendance.label !== "Whole trip" && <p className="text-base text-muted-foreground">{person.attendance.label}</p>}
    {!runs.length && <p className="mt-2 text-base text-muted-foreground">No nights are planned for you yet.</p>}
    <ul className="mt-2 divide-y divide-border border-y border-border empty:border-y-0">
      {runs.map((run) => {
        const changeover = person.changeovers.find((entry) => entry.date === run.end);
        return <li key={run.start} className="py-3">
          <p className={cn("break-words text-base font-semibold", run.gap ? "text-warning" : "text-foreground")}>
            {run.state === "assigned" ? <a href={`#stay-${run.stay_id}`} className="underline underline-offset-4">{run.label}</a> : run.gap ? "Not planned yet" : run.label}
          </p>
          <p className="text-base text-foreground">{run.date_label}</p>
          {changeover && <p className="text-base text-muted-foreground">{changeover.date_label}: leave {changeover.from} in the morning, then {changeover.to} that night</p>}
          {run.gap && canEdit && <Button type="button" variant="outline" className="mt-2" onClick={() => open({ action: "assign", memberIds: [person.member_id], dates: runDates(lodging, run) })}>Plan these nights</Button>}
        </li>;
      })}
    </ul>
  </section>;
}

/** People down the side and nights across: each run of nights in one place is one cell. */
function PeopleByNight({ lodging, people, viewerMemberId, canEdit, open, className }: {
  lodging: TripLodging; people: TripLodgingPerson[]; viewerMemberId: string | null; canEdit: boolean; open: Open; className?: string;
}) {
  const [selected, setSelected] = useState<{ member: string; start: string } | null>(null);
  const person = selected ? people.find((candidate) => candidate.member_id === selected.member) : undefined;
  const run = person?.runs.find((candidate) => candidate.start === selected?.start);
  return <section aria-labelledby="people-by-night-heading" className={className}>
    <h2 id="people-by-night-heading" className="text-lg font-semibold text-foreground">Each night</h2>
    <p className="text-base text-muted-foreground">Choose someone&apos;s nights for the details.</p>
    <div className="mt-2 overflow-x-auto">
      <table className="w-full border-collapse text-base">
        <caption className="sr-only">Who is staying where, by night. Each night&apos;s check-out is the next morning.</caption>
        <thead><tr className="border-b border-border">
          <th scope="col" className="sticky left-0 z-10 bg-background py-2 pr-4 text-left text-sm font-medium text-muted-foreground">Person</th>
          {lodging.nights.map((night) => <th key={night.date} scope="col" className="min-w-32 px-2 py-2 text-left align-bottom text-sm font-medium text-foreground">
            <span className="block font-normal text-muted-foreground">{night.pre_trip ? "Night before" : night.last_night ? "Last night" : "Night of"}</span>{night.date_label}
          </th>)}
        </tr></thead>
        <tbody className="divide-y divide-border">
          {people.map((entry) => <tr key={entry.member_id}>
            <th scope="row" className="sticky left-0 z-10 max-w-48 bg-background py-2 pr-4 text-left align-top font-normal">
              <span className="block break-words font-semibold text-foreground">{entry.display_name}{entry.member_id === viewerMemberId && entry.display_name !== "You" ? " (you)" : ""}</span>
              {personNote(entry) && <span className="block text-sm text-muted-foreground">{personNote(entry)}</span>}
            </th>
            {entry.runs.map((cell) => {
              const pressed = selected?.member === entry.member_id && selected.start === cell.start;
              return <td key={cell.start} colSpan={cell.nights} className="border-l border-border px-1 py-1 align-top">
                <button type="button" aria-pressed={pressed} aria-label={`${entry.display_name}: ${cell.gap ? "Not planned yet" : cell.label}, ${cell.date_label}`}
                  onClick={() => setSelected(pressed ? null : { member: entry.member_id, start: cell.start })}
                  className={cn("flex min-h-11 w-full flex-col items-start justify-center rounded-control px-2 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-primary-soft",
                    cell.state === "assigned" ? "text-foreground" : cell.gap && entry.membership !== "invited" ? "text-warning" : "text-muted-foreground")}>
                  {/* One bar across the run's nights shows they continue. */}
                  {cell.state === "assigned" && <span aria-hidden="true" className="mb-1 h-0.5 w-full rounded-full bg-primary/60" />}
                  <span className="break-words">{cell.gap ? "Not planned yet" : cell.label}</span>
                </button>
              </td>;
            })}
          </tr>)}
        </tbody>
      </table>
    </div>
    {person && run && <RunDetails person={person} run={run} lodging={lodging} canEdit={canEdit} open={open} />}
  </section>;
}

function RunDetails({ person, run, lodging, canEdit, open }: { person: TripLodgingPerson; run: TripPersonRun; lodging: TripLodging; canEdit: boolean; open: Open }) {
  const stay = run.stay_id ? lodging.stays.find((candidate) => candidate.id === run.stay_id) : undefined;
  const changeover = person.changeovers.find((entry) => entry.date === run.end);
  const morning = person.days.find((day) => day.date === run.end);
  const morningLabel = lodging.nights.find((night) => night.date === run.end)?.date_label;
  return <div className="mt-4 max-w-3xl border-l-2 border-border pl-4 text-base">
    <h3 className="break-words font-semibold text-foreground">{person.display_name} · {run.gap ? "Not planned yet" : run.label}</h3>
    <p className="text-foreground">{run.date_label}</p>
    {personNote(person) && <p className="text-muted-foreground">{personNote(person)}</p>}
    {stay && <p className="text-muted-foreground">{stayFacts(stay)}</p>}
    {changeover ? <p className="text-foreground">{changeover.date_label}: leaves {changeover.from} in the morning, then {changeover.to} that night</p>
      : stay && morningLabel && morning?.participation === "participating" && <p className="text-foreground">{morningLabel} morning: starts from {morning.starting_from}</p>}
    {canEdit && <div className="mt-2 flex flex-wrap gap-2">
      <Button type="button" variant="outline" onClick={() => open({ action: "assign", memberIds: [person.member_id], dates: runDates(lodging, run) })}>Change these nights</Button>
      <Button type="button" variant="outline" onClick={() => open({ action: "attendance", memberId: person.member_id })}>Change {possessive(person.display_name)} trip dates</Button>
    </div>}
  </div>;
}

function StayArticle({ stay, people, canEdit, perMember, open, departures }: {
  stay: TripStaySummary; people: TripLodgingPerson[]; canEdit: boolean; perMember: boolean; open: Open; departures: ReactNode;
}) {
  return <article id={`stay-${stay.id}`} className="min-w-0 scroll-mt-4 py-4">
    <h3 className="break-words text-xl font-semibold text-foreground">{stay.name}</h3>
    <p className="mt-1 text-base text-foreground">{stay.date_label}</p>
    {stay.checkout_label && <p className="text-base text-muted-foreground">{stay.checkout_label} · a starting point, not another night</p>}
    <p className="text-base text-muted-foreground">{stayFacts(stay)}</p>
    {people.length > 0 && stay.occupancy.length > 0 && <div className="mt-2">
      <p className="text-sm font-medium text-muted-foreground">Staying here</p>
      <ul>{stay.occupancy.map((run) => <li key={run.dates[0]} className="flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 break-words py-2 text-base text-foreground"><span className="text-muted-foreground">{run.date_label}:</span> {run.member_ids.length ? run.member_ids.map((id) => occupantName(people, id)).join(", ") : "Nobody yet"}</p>
        {canEdit && perMember && run.member_ids.length > 0 && <Button type="button" variant="ghost" className="shrink-0" onClick={() => open({ action: "assign", memberIds: run.member_ids, dates: run.dates })}
          aria-label={`Change nights ${run.date_label} at ${stay.name}`}>Change</Button>}
      </li>)}</ul>
    </div>}
    {departures}
    {!!stay.review_dates.length && <p className="mt-2 text-base text-warning">Review dates outside the itinerary: {stay.review_dates.join(", ")}. Stay dates and bookings have been kept.</p>}
    <details className="mt-2 text-base text-foreground">
      <summary className="min-h-11 cursor-pointer py-2">Stay details</summary>
      <div className="space-y-2 break-words pb-2">
        {stay.type && <p>Type: {stay.type}</p>}
        {stay.location && <div><p>Location:</p><LocationSummary location={stay.location} exactTarget={STAY_EXACT} /></div>}
        {stay.address && <p>Address: {stay.address}</p>}
        {stay.check_in_time && <p>Check-in time: {stay.check_in_time.slice(0, 5)} · property local time</p>}
        {stay.check_out_time && <p>Check-out time: {stay.check_out_time.slice(0, 5)} · property local time</p>}
        {stay.notes && <p className="whitespace-pre-wrap">Crew notes: {stay.notes}</p>}
        {stay.property_url && <a href={stay.property_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-primary underline">Open property website (new tab)</a>}
      </div>
    </details>
    {canEdit && <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" onClick={() => open({ action: "save", stay })} aria-label={`Edit ${stay.name}`}>Edit</Button>
      {!stay.check_in && <Button type="button" variant="outline" onClick={() => open({ action: "save", stay, focus: "check_in" })}>Add dates</Button>}
      {perMember && !!stay.check_in && <Button type="button" variant="outline" onClick={() => open({ action: "save", stay, focus: "occupants" })} aria-label={`Choose who is staying at ${stay.name}`}>Who&apos;s staying</Button>}
      {!stay.location && <Button type="button" variant="outline" onClick={() => open({ action: "save", stay, focus: "location" })} aria-label={`Set location for ${stay.name}`}>Set location</Button>}
      <Button type="button" variant="outline" onClick={() => open({ action: "remove", stay })} aria-label={`Remove ${stay.name} from trip`}>Remove from trip</Button>
    </div>}
  </article>;
}

/** Each person's nights with no stay: not planned yet between trip days, or No accommodation needed. */
function NightsWithoutStay({ people, lodging, canEdit, open }: { people: TripLodgingPerson[]; lodging: TripLodging; canEdit: boolean; open: Open }) {
  // A pending invitation hasn't said they're coming, so their nights aren't missing yet.
  const rows = people.filter((person) => person.membership !== "invited")
    .flatMap((person) => person.runs.filter((run) => run.gap || run.state === "no_stay").map((run) => ({ person, run })));
  if (!rows.length) return null;
  return <section aria-labelledby="nights-without-stay-heading" className="mt-6">
    <h2 id="nights-without-stay-heading" className="text-lg font-semibold text-foreground">Nights without a stay</h2>
    <ul className="mt-1 divide-y divide-border border-y border-border">
      {rows.map(({ person, run }) => <li key={`${person.member_id}:${run.start}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
        <div className="min-w-0 break-words text-base">
          <p className="text-foreground">{person.display_name} · {run.date_label}</p>
          <p className={run.gap ? "text-warning" : "text-muted-foreground"}>{run.gap ? "Not planned yet" : run.label}</p>
        </div>
        {canEdit && <Button type="button" variant="outline" onClick={() => open({ action: "assign", memberIds: [person.member_id], dates: runDates(lodging, run) })}
          aria-label={`${run.gap ? "Plan" : "Change"} ${possessive(person.display_name)} nights ${run.date_label}`}>{run.gap ? "Plan" : "Change"}</Button>}
      </li>)}
    </ul>
  </section>;
}

/**
 * The day's starting point and stay, with the tour plan's meet time and the
 * day's access point, where the crew meets, between them when there's one (#210).
 * A person on the trip sees their own first, then the crew's where it differs (#333).
 */
export function DayLodging({ data, date, meet, meetingPoint = null, memberId = null }: {
  data: TripFull; date: string; meet?: string | null; meetingPoint?: string | null;
  /** The signed-in person's membership, whose own stay leads. */
  memberId?: string | null;
}) {
  const context = data.lodging?.days.find((day) => day.date === date);
  if (!context) return null;
  const mine = data.lodging?.people.find((person) => person.member_id === memberId)?.days.find((day) => day.date === date);
  const row = (term: string, value: string) => <div key={term}><dt className="text-muted-foreground">{term}</dt><dd className="break-words text-foreground">{value}</dd></div>;
  return <section className="min-w-0"><SectionLabel>{`${mine ? "Your stay" : "Crew stay"}${meet ? " and meet" : ""}`}</SectionLabel><dl className="mt-2 space-y-2 text-base">
    {row("Starting from", mine?.starting_from ?? context.starting_from)}
    {meet && row("Meet", `${meet} · ${meetingPoint ?? "Meeting point not set"}`)}
    {row("Staying tonight", mine?.staying_tonight ?? context.staying_tonight)}
    {mine && mine.starting_from !== context.starting_from && row("Crew starting from", context.starting_from)}
    {mine && mine.staying_tonight !== context.staying_tonight && row("Crew staying tonight", context.staying_tonight)}
  </dl></section>;
}
