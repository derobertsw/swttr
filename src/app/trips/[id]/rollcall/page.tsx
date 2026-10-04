"use client";

import { use, useMemo } from "react";
import PageLayout from "@/components/PageLayout";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BackLink,
  GarmentGlyph,
  MemberAvatar,
  SectionLabel,
  TripError,
} from "@/components/trips/trip-primitives";
import { cn } from "@/lib/utils";
import { useTrip } from "@/hooks/useTrip";

const REQUIRED_SLOTS = ["shirt", "midlayer", "shell", "pants", "gloves"];

export default function RollCallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, loading, error } = useTrip(id);

  // Use the first day's kits as roll-call snapshot (the "trailhead" moment).
  const rollCall = useMemo(() => {
    if (!data || data.days.length === 0) return [];
    const firstDay = data.days[0];
    return data.members
      .filter((m) => m.status !== "left")
      .map((m) => {
        const kit = data.kits.find(
          (k) => k.trip_day_id === firstDay.id && k.trip_member_id === m.id
        );
        const items = kit?.items ?? [];
        const missingRequired = REQUIRED_SLOTS.some((s) => !items.includes(s));
        const ready = items.length > 0 && !missingRequired && kit?.state !== "warn";
        return { member: m, items, ready };
      });
  }, [data]);

  return (
    <PageLayout chromeVariant="compact">
      <div className="flex w-full max-w-2xl flex-col gap-5">
        <BackLink href={`/trips/${id}`}>Trip</BackLink>
        <header>
          <SectionLabel>Departure day</SectionLabel>
          <h1 className="mt-1 text-title font-semibold text-foreground md:text-title-lg">
            Roll call
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Are we leaving? Visual readiness check.</p>
        </header>

        {loading && <Skeleton className="h-32 w-full rounded-card" />}
        {error && <TripError>{error}</TripError>}

        {data && rollCall.length === 0 && (
          <Card>
            <p className="text-sm text-muted-foreground">No crew on this trip yet.</p>
          </Card>
        )}

        {rollCall.map((row) => (
          <Card key={row.member.id} className={cn(!row.ready && "border-warning")}>
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={cn(
                  "inline-block size-2.5 shrink-0 rounded-full",
                  row.ready ? "bg-success" : "bg-warning"
                )}
                aria-hidden
              />
              <MemberAvatar name={row.member.display_name} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {row.member.display_name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {row.ready ? "ready" : "kit incomplete"}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {row.items.length === 0 ? (
                  <span className="text-xs text-muted-foreground">no kit</span>
                ) : (
                  row.items.slice(0, 6).map((slot) => (
                    <GarmentGlyph key={slot} kind={slot} />
                  ))
                )}
              </div>
              <Badge size="sm" variant={row.ready ? "success" : "warning"}>
                {row.ready ? "Ready" : "Missing"}
              </Badge>
            </div>
          </Card>
        ))}

        <div className="h-24" />
      </div>
    </PageLayout>
  );
}
