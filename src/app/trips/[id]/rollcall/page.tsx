"use client";

import { use, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionLabel, TripError } from "@/components/trips/trip-primitives";
import { usePublishTripSummary } from "@/hooks/useTrip";
import { tripActivityLabel } from "@/lib/trip-activities";
import { errorMessage, tripRequest, TripRequestError } from "@/lib/trip-requests";
import { cn } from "@/lib/utils";
import type { TripChecklist, TripChecklistPerson, TripDayChecklist } from "@/types/trips";

/** The people a day's checklist lists, in order. A pending invitation is never counted as coming. */
const GROUPS: Array<{ id: string; title: string; includes: (person: TripChecklistPerson) => boolean }> = [
  { id: "taking-part", title: "Taking part", includes: (person) => person.membership !== "invited" && person.participation === "participating" },
  { id: "not-taking-part", title: "There, not taking part", includes: (person) => person.membership !== "invited" && person.participation === "skipping" },
  { id: "invited", title: "Invitation pending", includes: (person) => person.membership === "invited" && person.participation !== "not_on_trip" },
];

/**
 * The Day checklist (#336), in Crew at the Roll call URL: one day at a time,
 * each person's clothing, tonight's stay, shared gear and source reviews as
 * separate facts, each linked to where it's done. The server works them out.
 */
export default function DayChecklistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<TripChecklist | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A link can name the day, e.g. ?date=2026-10-10.
  const [chosen, setChosen] = useState<string | null>(() => typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("date"));
  usePublishTripSummary(data?.trip);

  // Only the latest read is shown, so an older answer arriving late can't replace a newer one.
  const latest = useRef(0);
  const load = useCallback(() => {
    const request = ++latest.current;
    tripRequest<TripChecklist>(`/api/v1/trips/${id}/checklist`)
      .then((body) => { if (request === latest.current) { setData(body); setError(null); } })
      .catch((err) => {
        if (request !== latest.current) return;
        // Signed out or no longer on the trip: the crew's details go, as the trip pages' do.
        // A failure that may pass keeps the last checklist.
        if (err instanceof TripRequestError && [401, 403, 404].includes(err.status)) setData(null);
        setError(errorMessage(err));
      });
  }, [id]);
  useEffect(() => {
    load();
    // Read it again on coming back to the tab or online, as TripProvider does for
    // the trip, so the crew's changes meanwhile show. The day shown stays chosen.
    const onReturn = () => { if (document.visibilityState === "visible") load(); };
    window.addEventListener("focus", onReturn);
    window.addEventListener("online", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      latest.current += 1;
      window.removeEventListener("focus", onReturn);
      window.removeEventListener("online", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [load]);

  const day = data && (data.days.find((entry) => entry.date === chosen) ?? data.days.find((entry) => entry.date === data.default_date) ?? data.days[0]);
  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <header>
        <SectionLabel>Crew</SectionLabel>
        <h1 className="mt-1 text-title font-semibold text-foreground md:text-title-lg">Day checklist</h1>
        <p className="mt-1 text-base text-muted-foreground">
          One day at a time: each person&apos;s clothing, tonight&apos;s stay, shared gear and source reviews. Each is its own status, so nothing here says anyone is ready.
        </p>
      </header>

      {!data && !error && <Skeleton className="h-32 w-full rounded-card" />}
      {error && <div className="flex flex-col items-start gap-3">
        <TripError>{error}</TripError>
        <Button type="button" variant="outline" onClick={() => { setError(null); load(); }}>Try again</Button>
      </div>}

      {data && !data.days.length && <p className="text-base text-muted-foreground">This trip has no days yet. Add them in Plan.</p>}
      {data && day && <>
        <DayChooser days={data.days} selected={day.date} onSelect={setChosen} />
        <DayTasks tripId={id} day={day} viewer={data.viewer_member_id} />
      </>}
      <div className="h-24" />
    </div>
  );
}

/** Underlined dates, like Plan's date strip; the strip scrolls sideways on its own. */
function DayChooser({ days, selected, onSelect }: { days: TripDayChecklist[]; selected: string; onSelect: (date: string) => void }) {
  return <div role="group" aria-label="Choose a day" className="min-w-0 overflow-x-auto border-b border-border">
    <div className="flex">
      {days.map((day) => {
        const [weekday, ...rest] = day.date_label.split(" ");
        return <button key={day.date} type="button" aria-pressed={day.date === selected} onClick={() => onSelect(day.date)}
          aria-label={day.date_label}
          className="flex min-h-11 min-w-14 shrink-0 flex-col items-center justify-center border-b-2 border-transparent px-2 py-1 text-foreground transition-colors hover:border-input focus-visible:-outline-offset-2 aria-pressed:border-primary aria-pressed:font-semibold">
          <span className="text-xs text-muted-foreground">{weekday}</span>
          <span className="text-base">{rest.join(" ")}</span>
        </button>;
      })}
    </div>
  </div>;
}

function DayTasks({ tripId, day, viewer }: { tripId: string; day: TripDayChecklist; viewer: string | null }) {
  const away = day.people.filter((person) => person.participation === "not_on_trip");
  return <section aria-labelledby="checklist-day-heading" className="flex flex-col gap-6">
    <div>
      <h2 id="checklist-day-heading" className="text-xl font-semibold text-foreground">{day.date_label}</h2>
      <p className="text-base text-muted-foreground">{[day.activity ? tripActivityLabel(day.activity) : "Activity not set", day.place].filter(Boolean).join(" · ")}</p>
    </div>
    {!day.people.length && <p className="text-base text-muted-foreground">No crew on this trip yet.</p>}
    {GROUPS.map((group) => {
      const people = day.people.filter(group.includes);
      if (!people.length) return null;
      return <section key={group.id} aria-labelledby={`checklist-${group.id}`}>
        <h3 id={`checklist-${group.id}`} className="text-base font-semibold text-muted-foreground">{group.title} ({people.length})</h3>
        <ul className="mt-1 divide-y divide-border border-y border-border">
          {people.map((person) => <PersonTasks key={person.member_id} tripId={tripId} day={day} person={person} viewer={person.member_id === viewer} />)}
        </ul>
      </section>;
    })}
    {away.length > 0 && <p className="text-base text-muted-foreground">Not on the trip this day: {away.map((person) => person.display_name).join(", ")}</p>}
  </section>;
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return <div className="contents">
    <dt className="text-muted-foreground">{term}</dt>
    <dd className="min-w-0 break-words text-foreground">{children}</dd>
  </div>;
}

const linkClassName = "underline underline-offset-4 hover:no-underline";

function PersonTasks({ tripId, day, person, viewer }: { tripId: string; day: TripDayChecklist; person: TripChecklistPerson; viewer: boolean }) {
  const name = viewer && person.display_name !== "You" ? `${person.display_name} (you)` : person.display_name;
  const { clothing, tonight, conditions } = person;
  const dayHref = `/trips/${encodeURIComponent(tripId)}/days/${day.date}`;
  return <li className="py-4">
    <p className="break-words text-base font-semibold text-foreground">{name}</p>
    <p className="text-sm text-muted-foreground">{[person.membership_label, person.participation === "skipping" && person.participation_label].filter(Boolean).join(" · ")}</p>
    <dl className="mt-2 grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-base sm:grid-cols-[8rem_minmax(0,1fr)]">
      <Fact term="Clothing">
        <Link href={`${dayHref}#kit-${person.member_id}`} className={linkClassName} aria-label={`${person.display_name}'s clothing for ${day.date_label}: ${clothing.label}`}>{clothing.label}</Link>
        {clothing.flag && <span className="text-warning"> · {clothing.flag.label}</span>}
        {clothing.notes.map((note) => <span key={note} className="block text-sm text-muted-foreground">{note}</span>)}
      </Fact>
      {tonight && <Fact term="Tonight">
        {tonight.state === "not_on_trip" ? <span className="text-muted-foreground">{tonight.label}</span>
          : <Link href={`/trips/${encodeURIComponent(tripId)}/stays${tonight.stay_id ? `#stay-${tonight.stay_id}` : ""}`} className={cn(linkClassName, tonight.gap && "text-warning")}
            aria-label={`${person.display_name}'s stay the night of ${day.date_label}: ${tonight.gap ? "Not planned yet" : tonight.label}`}>{tonight.gap ? "Not planned yet" : tonight.label}</Link>}
      </Fact>}
      <Fact term="Shared gear">
        {person.shared.length ? <ul>{person.shared.map((item) => <li key={item.id}>
          <Link href={`/trips/${encodeURIComponent(tripId)}/gear#shared-${item.id}`} className={linkClassName}>{item.description}</Link>
          <span className="text-muted-foreground"> · {item.label}</span>
        </li>)}</ul> : <span className="text-muted-foreground">None assigned</span>}
      </Fact>
      {conditions && <Fact term="Source reviews">
        <Link href={`${dayHref}#conditions-heading`} className={linkClassName} aria-label={`${person.display_name}'s source reviews for ${day.date_label}: ${conditions.label}`}>{conditions.label}</Link>
      </Fact>}
      {viewer && <Fact term="Your packing">
        <Link href={`/trips/${encodeURIComponent(tripId)}/pack`} className={linkClassName}>Your packing list</Link>
        <span className="text-muted-foreground"> · checks are private to you</span>
      </Fact>}
    </dl>
  </li>;
}
