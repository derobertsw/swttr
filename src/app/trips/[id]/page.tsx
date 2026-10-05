"use client";

import { use } from "react";
import Link from "next/link";
import { ChevronRight, Package, Settings, ShieldCheck, Users } from "lucide-react";
import PageLayout from "@/components/PageLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BackLink,
  MemberAvatar,
  SectionLabel,
  Spine,
  StopDot,
  TripError,
  daysBetween,
  formatDateRange,
} from "@/components/trips/trip-primitives";
import { useUserId } from "@/hooks/useUserId";
import { useTrip } from "@/hooks/useTrip";
import { TripStays } from "@/components/trips/TripStays";
import type { TripDay, TripStop } from "@/types/trips";

export default function TripOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, loading, error, refresh } = useTrip(id);
  const userId = useUserId();
  const member = data?.members.find((m) => m.user_id === userId && m.status !== "left");
  const nextDay = data?.days.find((day) => !day.activity || !data.kits.some((kit) => kit.trip_day_id === day.id && kit.trip_member_id === member?.id));

  return (
    <PageLayout chromeVariant="compact">
      <div className="flex w-full max-w-3xl flex-col gap-5">
        <div className="flex items-center justify-between">
          <BackLink href="/trips">All trips</BackLink>
          {data && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/trips/${id}/manage`}>
                <Settings />
                Manage crew
              </Link>
            </Button>
          )}
        </div>

        {loading && (
          <>
            <Skeleton className="h-24 w-full rounded-card" />
            <Skeleton className="h-16 w-full rounded-card" />
            <Skeleton className="h-48 w-full rounded-card" />
          </>
        )}
        {error && <TripError>{error}</TripError>}

        {data && (
          <>
            <header>
              <p role="status" className="mb-2 text-sm text-success">Saved trip</p>
              <SectionLabel>
                {data.stops[0]?.name ?? "no stop"} · {daysBetween(data.trip.start_date, data.trip.end_date)} days
              </SectionLabel>
              <h1 className="mt-1 text-title font-semibold text-foreground md:text-title-lg">
                {data.trip.name}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatDateRange(data.trip.start_date, data.trip.end_date)}
              </p>
            </header>

            {(data.stops.length === 0 || nextDay) && (
              <Card>
                <SectionLabel>Next step</SectionLabel>
                <p className="mt-2 text-sm text-foreground">{data.stops.length === 0 ? "Add a destination to start your daily plan." : !nextDay?.activity ? "Choose an activity for your next unplanned day." : "Plan your kit for your next unplanned day."}</p>
                <Link className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary" href={data.stops.length === 0 ? `/trips/${id}/stops` : `/trips/${id}/days/${nextDay!.date}`}>
                  {data.stops.length === 0 ? "Add first destination" : "Plan this day"}<ChevronRight className="size-4" />
                </Link>
              </Card>
            )}

            <Card>
              <div className="flex flex-wrap items-center gap-2">
                {data.members
                  .filter((m) => m.status !== "left")
                  .map((m) => (
                    <MemberAvatar
                      key={m.id}
                      name={m.display_name}
                      state={m.role === "organizer" ? "self" : m.status === "guest" ? "guest" : m.status === "invited" ? "invited" : "default"}
                      size={32}
                    />
                  ))}
                <Button asChild variant="outline" size="sm">
                  <Link href={`/trips/${id}/manage`}>+ add</Link>
                </Button>
                <div className="ml-auto flex items-center gap-2">
                  <Button asChild variant="secondary" size="sm">
                    <Link href={`/trips/${id}/rollcall`}>
                      <ShieldCheck />
                      Roll call
                    </Link>
                  </Button>
                </div>
              </div>
            </Card>

            <Card>
              <div className="flex flex-wrap items-center justify-between gap-2">
              <SectionLabel>
                {data.stops.length} {data.stops.length === 1 ? "stop" : "stops"}
              </SectionLabel>
              <Link href={`/trips/${id}/stops`} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary">Add or edit destinations</Link>
              </div>
              {data.stops.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No stops yet.</p>
              ) : (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {data.stops.map((s, i) => (
                    <span key={s.id} className="flex min-w-0 max-w-full items-center gap-1.5">
                      {/* Stop names aren't length-bounded, so the badge wraps instead of overflowing. */}
                      <Badge size="sm" variant="outline" className="min-w-0 shrink whitespace-normal wrap-anywhere">
                        <StopDot stopIndex={i} />
                        {s.name}
                      </Badge>
                      {i < data.stops.length - 1 && (
                        <span className="text-muted-foreground" aria-hidden>→</span>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </Card>

            <TripStays data={data} canEdit={data.trip.owner_user_id === userId} onSaved={refresh} />

            <DayList trip={data.trip} days={data.days} stops={data.stops} />

            <Card>
              <SectionLabel>Crew tools</SectionLabel>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <ToolLink href={`/trips/${id}/manage`} icon={Users} label="Manage crew" />
                <ToolLink href={`/trips/${id}/gear`} icon={Package} label="Group gear" />
                <ToolLink href={`/trips/${id}/pack`} icon={Package} label="My pack list" />
              </div>
            </Card>

            <div className="h-24" />
          </>
        )}
      </div>
    </PageLayout>
  );
}

function DayList({
  trip,
  days,
  stops,
}: {
  trip: { id: string };
  days: TripDay[];
  stops: TripStop[];
}) {
  const stopById = new Map(stops.map((s, i) => [s.id, { stop: s, index: i }]));
  const baseStop = stops[0];
  return (
    <div className="flex flex-col gap-1.5">
      <SectionLabel className="mb-1">Daily plan</SectionLabel>
      {days.map((d, i) => {
        const prev = days[i - 1];
        const effectiveStopId = d.stop_id ?? baseStop?.id ?? null;
        const prevEffectiveStopId = prev ? prev.stop_id ?? baseStop?.id ?? null : null;
        const stopChange = !prev || prevEffectiveStopId !== effectiveStopId;
        const stopMeta = effectiveStopId ? stopById.get(effectiveStopId) : undefined;
        const colorIndex = stopMeta?.index ?? -1;
        const isBaseFallback = !d.stop_id && !!baseStop;
        return (
          <div key={d.id}>
            {stopChange && stopMeta && (
              <div className="mb-1.5 mt-2 flex items-center gap-2">
                <StopDot stopIndex={colorIndex} />
                <SectionLabel>
                  {stopMeta.stop.name}
                  {isBaseFallback && <span className="ml-1.5">· base</span>}
                </SectionLabel>
                <span className="h-px flex-1 bg-border" />
              </div>
            )}
            <Card asChild interactive>
              <Link href={`/trips/${trip.id}/days/${d.date}`}>
                <div className="flex items-center gap-3">
                  {colorIndex >= 0 && <Spine stopIndex={colorIndex} />}
                  <div className="w-14 shrink-0">
                    <p className="text-xs text-muted-foreground">
                      {new Date(`${d.date}T00:00:00`).toLocaleDateString(undefined, {
                        weekday: "short",
                      })}
                    </p>
                    <p className="text-base font-semibold text-foreground">
                      {new Date(`${d.date}T00:00:00`).getDate()}
                    </p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">
                      {d.activity ?? "no activity set"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {stopMeta
                        ? `${stopMeta.stop.name}${isBaseFallback ? " · base" : ""}`
                        : "Add a base location to enable forecasts"}
                    </p>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </div>
              </Link>
            </Card>
          </div>
        );
      })}
      {days.length === 0 && (
        <p className="text-sm text-muted-foreground">No days configured.</p>
      )}
    </div>
  );
}

function ToolLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof Users;
  label: string;
}) {
  return (
    <Button asChild variant="outline" className="justify-start font-medium">
      <Link href={href}>
        <Icon className="text-muted-foreground" />
        {label}
        <ChevronRight className="ml-auto text-muted-foreground" />
      </Link>
    </Button>
  );
}
