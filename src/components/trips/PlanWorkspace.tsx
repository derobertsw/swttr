"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, List } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Spine, StopDot } from "@/components/trips/trip-primitives";
import { useTrip } from "@/hooks/useTrip";
import { useUserId } from "@/hooks/useUserId";
import { tripActivityLabel, tripActivityNeedsClothing } from "@/lib/trip-activities";
import { tripLocation } from "@/lib/trip-sections";
import { cn } from "@/lib/utils";
import type { TripDay, TripFull } from "@/types/trips";

/**
 * The Plan section's frame (#330): the trip's days in order beside the page
 * Plan shows, a day or Plan's own page. Wide screens show both, with one rule
 * between them. Narrow ones show one at a time: the days on Plan's own page,
 * and a date strip with All days above a day. The width is the workspace's,
 * not the window's, so an expanded sidebar can turn the split off.
 */
export function PlanWorkspace({ tripId, children }: { tripId: string; children: ReactNode }) {
  const pathname = usePathname();
  const date = tripLocation(pathname, tripId)?.date ?? null;
  const { data, loading } = useTrip(tripId);
  return (
    <div className="@container w-full min-w-0">
      <div className="grid gap-8 @4xl:grid-cols-[minmax(15rem,18rem)_minmax(0,1fr)] @4xl:gap-0">
        <TripItinerary
          tripId={tripId}
          data={data}
          loading={loading}
          selected={date}
          // Beside a long day the list stays in view, and scrolls on its own
          // when the trip has more days than fit.
          className={cn(
            "@4xl:sticky @4xl:top-[calc(env(safe-area-inset-top)+3.5rem)] @4xl:max-h-[calc(100dvh-env(safe-area-inset-top)-4.5rem)] @4xl:self-start @4xl:overflow-y-auto @4xl:pr-6",
            date && "hidden @4xl:flex"
          )}
        />
        <div className="min-w-0 @4xl:border-l @4xl:border-border @4xl:pl-8">
          {date && data && data.days.length > 0 && (
            <DateStrip tripId={tripId} days={data.days} selected={date} className="mb-6 @4xl:hidden" />
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

function dateLabel(date: string, options: Intl.DateTimeFormatOptions) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, options);
}

/** Scrolls a scrollable box, and only that box, so an item in it is in view. */
function revealWithin(box: HTMLElement, item: HTMLElement, axis: "x" | "y") {
  const outer = box.getBoundingClientRect();
  const inner = item.getBoundingClientRect();
  if (axis === "x") {
    if (box.scrollWidth > box.clientWidth) box.scrollLeft += inner.left + inner.width / 2 - (outer.left + outer.width / 2);
    return;
  }
  // Until the list sticks, part of it can be below the window: aim for the part in view.
  const top = Math.max(outer.top, 0);
  const bottom = Math.min(outer.bottom, window.innerHeight);
  if (box.scrollHeight > box.clientHeight && (inner.top < top || inner.bottom > bottom)) {
    box.scrollTop += inner.top + inner.height / 2 - (top + bottom) / 2;
  }
}

/**
 * What to do next: the first day without an activity, or without your kit on
 * a day you take part in that has clothing to plan (not Travel or Rest, #334).
 */
function nextStep(data: TripFull, userId: string | null) {
  if (data.stops.length === 0) {
    return {
      text: "Add a destination to start your daily plan.",
      label: "Add first destination",
      href: `/trips/${data.trip.id}/stops`,
      date: null,
    };
  }
  const member = data.members.find((m) => m.user_id === userId && m.status !== "left");
  const person = data.lodging?.people.find((entry) => entry.member_id === member?.id);
  const takesPart = (date: string) => (person?.days.find((entry) => entry.date === date)?.participation ?? "participating") === "participating";
  const day = data.days.find((candidate) => !candidate.activity
    || (tripActivityNeedsClothing(candidate.activity) && takesPart(candidate.date)
      && !data.kits.some((kit) => kit.trip_day_id === candidate.id && kit.trip_member_id === member?.id)));
  if (!day) return null;
  return {
    text: !day.activity ? "Choose an activity for your next unplanned day." : "Plan your kit for your next unplanned day.",
    label: "Plan this day",
    href: `/trips/${data.trip.id}/days/${day.date}`,
    date: day.date,
  };
}

/** The trip's days in order, grouped by destination, with what to do next. */
function TripItinerary({ tripId, data, loading, selected, className }: {
  tripId: string;
  data: TripFull | null;
  loading: boolean;
  selected: string | null;
  className?: string;
}) {
  const userId = useUserId();
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    const current = box.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (box.current && current) revealWithin(box.current, current, "y");
  }, [selected, data]);

  if (!data) {
    return loading ? (
      <div className={cn("flex flex-col gap-2", className)}>
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-14 w-full rounded-control" />
        <Skeleton className="h-14 w-full rounded-control" />
      </div>
    ) : null;
  }

  const step = nextStep(data, userId);
  const stopById = new Map(data.stops.map((stop, index) => [stop.id, { stop, index }]));
  const base = data.stops[0];
  const stopOf = (day: TripDay) => day.stop_id ?? base?.id ?? null;

  return (
    <nav ref={box} aria-labelledby="trip-days-heading" className={cn("flex min-w-0 flex-col gap-3", className)}>
      <h2 id="trip-days-heading" className="text-xl font-semibold text-foreground">Days</h2>
      {step && (!step.date || step.date !== selected) && (
        <div>
          <p className="text-sm font-medium text-muted-foreground">Next step</p>
          <p className="mt-0.5 text-base text-foreground">{step.text}</p>
          <Link className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary" href={step.href}>
            {step.label}
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      )}
      {data.days.length === 0 ? (
        <p className="text-sm text-muted-foreground">No days configured.</p>
      ) : (
        <ol className="flex flex-col gap-0.5">
          {data.days.map((day, i) => {
            const stopId = stopOf(day);
            const stopMeta = stopId ? stopById.get(stopId) : undefined;
            const stopChange = i === 0 || stopOf(data.days[i - 1]) !== stopId;
            return (
              <li key={day.id}>
                {stopChange && stopMeta && (
                  <p className="mb-1 mt-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <StopDot stopIndex={stopMeta.index} />
                    <span className="min-w-0 wrap-anywhere">
                      {stopMeta.stop.name}
                      {!day.stop_id && " · base"}
                    </span>
                    <span aria-hidden className="h-px min-w-4 flex-1 bg-border" />
                  </p>
                )}
                <Link
                  href={`/trips/${tripId}/days/${day.date}`}
                  aria-current={day.date === selected ? "page" : undefined}
                  className="flex min-h-11 items-stretch gap-3 rounded-control px-2 py-2 transition-colors hover:bg-accent focus-visible:-outline-offset-2 aria-[current=page]:bg-primary-soft"
                >
                  {stopMeta && <Spine stopIndex={stopMeta.index} />}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground">
                      {dateLabel(day.date, { weekday: "short", month: "short", day: "numeric" })}
                    </span>
                    <span className="block text-sm text-muted-foreground wrap-anywhere">{day.activity ? tripActivityLabel(day.activity) : "Activity not set"}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </nav>
  );
}

/**
 * The days as an underlined strip above a day on narrow screens. All days
 * opens Plan's own page with the full list. The strip scrolls sideways on
 * its own, so the page never does.
 */
function DateStrip({ tripId, days, selected, className }: {
  tripId: string;
  days: TripDay[];
  selected: string;
  className?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const current = scroller.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (scroller.current && current) revealWithin(scroller.current, current, "x");
  }, [selected]);

  return (
    <nav aria-label="Choose a day" className={cn("flex min-w-0 items-stretch", className)}>
      <Link
        href={`/trips/${tripId}`}
        className="flex min-h-11 shrink-0 items-center gap-1.5 pr-3 text-sm font-semibold text-primary"
      >
        <List className="size-4" aria-hidden="true" />
        All days
      </Link>
      <div ref={scroller} className="min-w-0 flex-1 overflow-x-auto border-l border-border">
        <ol className="flex">
          {days.map((day) => (
            <li key={day.id} className="shrink-0">
              <Link
                href={`/trips/${tripId}/days/${day.date}`}
                aria-current={day.date === selected ? "page" : undefined}
                // Relative, so the hidden month stays inside the strip
                // instead of widening the page.
                className="relative flex min-h-11 min-w-12 flex-col items-center justify-center border-b-2 border-transparent px-2 py-1 text-foreground transition-colors hover:border-input focus-visible:-outline-offset-2 aria-[current=page]:border-primary aria-[current=page]:font-semibold"
              >
                <span className="text-xs text-muted-foreground">{dateLabel(day.date, { weekday: "short" })}</span>
                {" "}
                <span className="text-base">{dateLabel(day.date, { day: "numeric" })}</span>
                <span className="sr-only"> {dateLabel(day.date, { month: "long" })}</span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </nav>
  );
}
