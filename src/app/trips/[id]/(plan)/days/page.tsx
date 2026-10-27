"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { TripError } from "@/components/trips/trip-primitives";
import { useTrip } from "@/hooks/useTrip";
import { openTripPath } from "@/lib/trip-sections";

/**
 * Opening a trip (#334): the trip list and Plan, from another section, come
 * here, and it replaces itself with the right day for you, so Back skips it.
 * See `openTripPath` for which day.
 */
export default function OpenTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error } = useTrip(id);
  const router = useRouter();

  useEffect(() => {
    if (data) router.replace(openTripPath(id, data));
  }, [data, id, router]);

  return (
    <div className="flex w-full max-w-3xl flex-col gap-8">
      {error && !data ? <TripError>{error}</TripError> : <Skeleton className="h-32 w-full rounded-card" />}
    </div>
  );
}
