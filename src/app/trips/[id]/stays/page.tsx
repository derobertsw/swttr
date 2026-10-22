"use client";

import { use } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { TripError } from "@/components/trips/trip-primitives";
import { TripStays } from "@/components/trips/TripStays";
import { useTrip } from "@/hooks/useTrip";
import { useUserId } from "@/hooks/useUserId";

/** The Stays section (#330): the trip's stays and each night's plan. */
export default function TripStaysPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, loading, error, refresh } = useTrip(id);
  const userId = useUserId();
  return (
    <div className="flex w-full max-w-6xl flex-col gap-5">
      {loading && !data && <Skeleton className="h-48 w-full rounded-card" />}
      {error && <TripError>{error}</TripError>}
      {data && <TripStays data={data} canEdit={data.trip.owner_user_id === userId} onSaved={refresh}
        viewerMemberId={data.members.find((member) => member.user_id === userId)?.id ?? null} />}
      <div className="h-24" />
    </div>
  );
}
