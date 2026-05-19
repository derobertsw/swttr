"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, MapPin, Plus, Users } from "lucide-react";
import PageLayout from "@/components/PageLayout";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  Chip,
  MemberAvatar,
  SectionLabel,
  formatDateRange,
  daysBetween,
} from "@/components/trips/trip-primitives";
import type { TripSummary } from "@/types/trips";

const STATUS_LABEL: Record<TripSummary["status"], string> = {
  planning: "planning",
  next_up: "next up",
  live: "live",
  past: "past",
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
          <h1 className="mt-1 text-[2.25rem] font-semibold leading-tight tracking-[-0.04em] text-white/94">
            Trips
          </h1>
          <p className="mt-1 text-sm text-white/62">
            Pick a trip to plan kits, manage your crew, and pack faster.
          </p>
        </header>

        <Link
          href="/trips/new"
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/12 bg-gradient-to-b from-cyan-300/22 to-cyan-300/10 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(0,0,0,0.32)] transition-colors hover:bg-cyan-300/16"
        >
          <Plus className="size-4" />
          New trip
        </Link>

        {error && (
          <div className="rounded-xl border border-orange-400/35 bg-orange-300/10 px-4 py-3 text-sm text-orange-100">
            {error}
          </div>
        )}

        {trips === null && !error ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-24 w-full rounded-2xl bg-white/12" />
            <Skeleton className="h-24 w-full rounded-2xl bg-white/12" />
            <Skeleton className="h-24 w-full rounded-2xl bg-white/12" />
          </div>
        ) : trips && trips.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/22 bg-white/[0.04] px-5 py-10 text-center">
            <Loader2 className="mx-auto mb-3 size-8 text-white/35" />
            <p className="text-base font-medium text-white/85">No trips yet</p>
            <p className="mt-1 text-sm text-white/60">
              A trip can be solo or shared. Tap “New trip” to get started.
            </p>
          </div>
        ) : (
          <>
            {grouped.upcoming.length > 0 && (
              <section className="flex flex-col gap-2.5">
                <SectionLabel>Upcoming</SectionLabel>
                {grouped.upcoming.map((trip, i) => (
                  <TripRow key={trip.id} trip={trip} highlighted={i === 0} />
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

function TripRow({ trip, highlighted = false }: { trip: TripSummary; highlighted?: boolean }) {
  const total = daysBetween(trip.start_date, trip.end_date);
  return (
    <Link href={`/trips/${trip.id}`} className="block">
      <Card highlighted={highlighted}>
        <div className="flex items-center gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-white/14 bg-white/[0.06]">
            <MapPin className="size-5 text-white/72" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-white/95">{trip.name}</p>
            <p className="mt-0.5 text-xs text-white/62">
              {formatDateRange(trip.start_date, trip.end_date)} · {total}{" "}
              {total === 1 ? "day" : "days"} · {trip.member_count}{" "}
              {trip.member_count === 1 ? "person" : "people"}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Chip variant={highlighted ? "accent" : "outline"}>{STATUS_LABEL[trip.status]}</Chip>
              {trip.stop_count > 0 && (
                <Chip variant="outline">
                  <Users className="size-3" /> {trip.stop_count} stop
                  {trip.stop_count === 1 ? "" : "s"}
                </Chip>
              )}
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
