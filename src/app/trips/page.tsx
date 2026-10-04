"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MapPin, Plus, Users } from "lucide-react";
import PageLayout from "@/components/PageLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SectionLabel,
  TripError,
  formatDateRange,
  daysBetween,
} from "@/components/trips/trip-primitives";
import type { TripSummary } from "@/types/trips";

const STATUS_LABEL: Record<TripSummary["status"], string> = {
  planning: "Planning",
  next_up: "Next up",
  live: "Live",
  past: "Past",
};

export default function TripsHomePage() {
  const [trips, setTrips] = useState<TripSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/trips")
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed (${res.status})`);
        return res.json();
      })
      .then((data: { trips: TripSummary[] }) => {
        if (!cancelled) setTrips(data.trips);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => {
    if (!trips) return { upcoming: [], past: [] };
    return {
      upcoming: trips.filter((t) => t.status !== "past"),
      past: trips.filter((t) => t.status === "past"),
    };
  }, [trips]);

  return (
    <PageLayout chromeVariant="compact">
      <div className="flex w-full max-w-3xl flex-col gap-5">
        <header>
          <SectionLabel>Your trips</SectionLabel>
          <h1 className="mt-1 text-title font-semibold text-foreground md:text-title-lg">Trips</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick a trip to plan kits, manage your crew, and pack faster.
          </p>
        </header>

        <Button asChild size="lg" className="w-full">
          <Link href="/trips/new">
            <Plus />
            New trip
          </Link>
        </Button>

        {error && <TripError>{error}</TripError>}

        {trips === null && !error ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-24 w-full rounded-card" />
            <Skeleton className="h-24 w-full rounded-card" />
            <Skeleton className="h-24 w-full rounded-card" />
          </div>
        ) : trips && trips.length === 0 ? (
          <Card variant="muted" padding="lg" className="py-10 text-center">
            <MapPin className="mx-auto mb-3 size-8 text-muted-foreground" aria-hidden />
            <p className="text-base font-semibold text-foreground">No trips yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              A trip can be solo or shared. Tap “New trip” to get started.
            </p>
          </Card>
        ) : (
          <>
            {grouped.upcoming.length > 0 && (
              <section className="flex flex-col gap-2.5">
                <SectionLabel>Upcoming</SectionLabel>
                {grouped.upcoming.map((trip, i) => (
                  <TripRow key={trip.id} trip={trip} next={i === 0} />
                ))}
              </section>
            )}
            {grouped.past.length > 0 && (
              <section className="flex flex-col gap-2.5">
                <SectionLabel>Past</SectionLabel>
                {grouped.past.map((trip) => (
                  <TripRow key={trip.id} trip={trip} />
                ))}
              </section>
            )}
          </>
        )}

        {/* Spacer for mobile tab bar */}
        <div className="h-24" />
      </div>
    </PageLayout>
  );
}

function TripRow({ trip, next = false }: { trip: TripSummary; next?: boolean }) {
  const total = daysBetween(trip.start_date, trip.end_date);
  return (
    <Card asChild interactive>
      <Link href={`/trips/${trip.id}`}>
        <div className="flex items-center gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-control bg-muted">
            <MapPin className="size-5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-foreground">{trip.name}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {formatDateRange(trip.start_date, trip.end_date)} · {total}{" "}
              {total === 1 ? "day" : "days"} · {trip.member_count}{" "}
              {trip.member_count === 1 ? "person" : "people"}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Badge size="sm" variant={next ? "primary" : "outline"}>
                {STATUS_LABEL[trip.status]}
              </Badge>
              {trip.stop_count > 0 && (
                <Badge size="sm" variant="outline">
                  <Users /> {trip.stop_count} stop
                  {trip.stop_count === 1 ? "" : "s"}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </Link>
    </Card>
  );
}
