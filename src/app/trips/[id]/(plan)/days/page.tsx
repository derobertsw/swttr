"use client";

import { use, useEffect, useState } from "react";
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
  const { data, error, reload } = useTrip(id);
  const router = useRouter();
  // From another section the workspace can already hold the trip, read a
  // while ago, and the day depends on today and on what's been planned since:
  // read it again before choosing. Without it, the first read is fresh. If
  // the new read fails, the trip as it was still opens.
  const [fresh, setFresh] = useState(() => data === null);
  useEffect(() => {
    if (fresh) return;
    let current = true;
    void reload().then(() => { if (current) setFresh(true); });
    return () => { current = false; };
  }, [fresh, reload]);

  useEffect(() => {
    if (fresh && data) router.replace(openTripPath(id, data));
  }, [fresh, data, id, router]);

  return (
    <div className="flex w-full max-w-3xl flex-col gap-8">
      {error && !data ? <TripError>{error}</TripError> : <Skeleton className="h-32 w-full rounded-card" />}
    </div>
  );
}
