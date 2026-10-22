"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";
import PageLayout from "@/components/PageLayout";
import { Button } from "@/components/ui/button";
import { BackLink, daysBetween, formatDateRange } from "@/components/trips/trip-primitives";
import { useTripSummary } from "@/hooks/useTrip";
import { TRIP_SECTIONS, tripLocation, tripSectionHref, type TripSectionId } from "@/lib/trip-sections";
import { cn } from "@/lib/utils";

/**
 * Every trip page's frame (#330): the trip's name and dates, then its four
 * sections, Plan · Stays · Crew · Packing, reachable from every page. The
 * trip layout renders it, so it stays put while the page below it changes.
 */
export function TripWorkspace({ tripId, children }: { tripId: string; children: ReactNode }) {
  const pathname = usePathname();
  const location = tripLocation(pathname, tripId);
  const summary = useTripSummary(tripId);
  // Where Plan last was: its own page or a day. Coming back to Plan from
  // another section returns there, so the selected day isn't lost.
  const [planPath, setPlanPath] = useState<string | null>(null);
  const onPlan = location?.section === "plan" && (location.subpath === "" || location.date !== null);
  if (onPlan && planPath !== pathname) setPlanPath(pathname);
  // On Plan's own page the trip's name is the page's title. Elsewhere the
  // page has its own, and the name only says which trip it is.
  const Title = location?.subpath === "" ? "h1" : "p";

  return (
    <PageLayout chromeVariant="compact">
      <div className="flex w-full min-w-0 flex-col gap-5">
        <header className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center justify-between gap-x-3">
            <BackLink href="/trips">All trips</BackLink>
            {summary && location?.subpath !== "/settings" && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/trips/${tripId}/settings`}>
                  <Settings />
                  Edit trip
                </Link>
              </Button>
            )}
          </div>
          {summary && (
            <>
              <Title className="text-xl font-semibold text-foreground wrap-anywhere">{summary.name}</Title>
              <p className="text-sm text-muted-foreground">
                {formatDateRange(summary.start_date, summary.end_date)} · {dayCount(summary.start_date, summary.end_date)}
              </p>
              {/* A new trip opens here once it's saved (#169). */}
              {Title === "h1" && <p role="status" className="text-sm text-success">Saved trip</p>}
            </>
          )}
        </header>
        <TripSectionNav
          tripId={tripId}
          current={location?.section ?? null}
          currentIsSectionPage={!!location && TRIP_SECTIONS.some((section) => section.path === location.subpath)}
          planPath={planPath}
        />
        {children}
      </div>
    </PageLayout>
  );
}

function dayCount(start: string, end: string) {
  const days = daysBetween(start, end);
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/**
 * The four sections as underlined tabs. They're links, not a tablist: each
 * one is its own page. The bar sticks below the safe area so a long day can
 * change section without scrolling back up.
 */
function TripSectionNav({ tripId, current, currentIsSectionPage, planPath }: {
  tripId: string;
  current: TripSectionId | null;
  /** Whether the page is the current section's own page rather than one inside it. */
  currentIsSectionPage: boolean;
  planPath: string | null;
}) {
  return (
    <nav aria-label="Trip sections" className="sticky top-[env(safe-area-inset-top)] z-20 bg-background">
      <ul className="grid grid-cols-4 border-b border-border sm:flex sm:gap-2">
        {TRIP_SECTIONS.map((section) => {
          const active = section.id === current;
          // Plan, from elsewhere, goes back to the day it showed. From
          // inside Plan it goes to Plan's own page, with every day.
          const href = section.id === "plan" && !active && planPath ? planPath : tripSectionHref(tripId, section);
          return (
            <li key={section.id} className="min-w-0">
              <Link
                href={href}
                aria-current={active ? (currentIsSectionPage ? "page" : "true") : undefined}
                data-active={active || undefined}
                className={cn(
                  "relative flex min-h-11 items-center justify-center px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:px-3",
                  "after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-primary after:opacity-0",
                  "data-active:font-semibold data-active:text-foreground data-active:after:opacity-100"
                )}
              >
                {section.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
