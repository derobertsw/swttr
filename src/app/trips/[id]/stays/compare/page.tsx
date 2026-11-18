"use client";

import { use } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { TripError } from "@/components/trips/trip-primitives";
import { StayComparison } from "@/components/trips/StayComparison";
import { useTrip } from "@/hooks/useTrip";
import { useUserId } from "@/hooks/useUserId";

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;

/**
 * Compare stays (#213), inside the Stays section: two or three stays or
 * options over the same nights. The address keeps what's chosen:
 * ?options=stay:<id>,candidate:<id>&first_night=…&checkout=…
 */
export default function CompareStaysPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = use(params);
  const query = use(searchParams);
  const { data, loading, error, refresh } = useTrip(id);
  const userId = useUserId();
  return (
    <div className="flex w-full max-w-6xl flex-col gap-5">
      {loading && !data && <Skeleton className="h-48 w-full rounded-card" />}
      {error && <TripError>{error}</TripError>}
      {data && <StayComparison data={data} canEdit={data.trip.owner_user_id === userId} onPlanSaved={refresh} initial={{
        options: (first(query.options) ?? "").split(",").map((key) => key.trim().toLowerCase()).filter(Boolean),
        first_night: first(query.first_night), checkout: first(query.checkout),
      }} />}
      <div className="h-24" />
    </div>
  );
}
