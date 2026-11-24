"use client";

import { use, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SharedGearAttention } from "@/components/trips/SharedGear";
import { TourPreparation } from "@/components/trips/DayChecks";
import { Skeleton } from "@/components/ui/skeleton";
import { StopDot, TripError } from "@/components/trips/trip-primitives";
import { useTrip } from "@/hooks/useTrip";
import { TripPlacesSummary } from "@/components/trips/TripPlacesSummary";
import { TripOfflineSave } from "@/components/trips/OfflineBrief";

/**
 * Plan's own page (#330): the trip's places and destinations, beside or
 * below its days. Stays, crew and packing have their own sections.
 */
export default function TripPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, loading, error, refresh } = useTrip(id);
  const router = useRouter();

  // Stays used to be part of this page. Older links to a stay, like
  // /trips/<id>#stay-<stay>, open it in Stays.
  useEffect(() => {
    const { hash } = window.location;
    if (hash.startsWith("#stay-") || hash === "#trip-stays-heading") router.replace(`/trips/${id}/stays${hash}`);
  }, [id, router]);

  return (
    <div className="@container flex w-full max-w-3xl flex-col gap-8">
      {loading && !data && (
        <>
          <Skeleton className="h-24 w-full rounded-card" />
          <Skeleton className="h-16 w-full rounded-card" />
        </>
      )}
      {error && <TripError onRetry={data ? undefined : () => void refresh()}>{error}</TripError>}

      {data && (
        // With room beside the days (#267), what needs doing and the places
        // lead, and the destinations and the offline save sit beside them.
        // The width is this page's, as the days' split is the workspace's.
        <div className="grid grid-cols-1 gap-8 @[45rem]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] @[45rem]:items-start">
          <div className="flex min-w-0 flex-col gap-8">
            <TourPreparation items={data.preparation} />
            <SharedGearAttention tripId={id} gear={data.gear} />
            <TripPlacesSummary tripId={id} revision={data} />
          </div>
          <div className="flex min-w-0 flex-col gap-8">
            <section aria-labelledby="trip-destinations-heading" className="flex min-w-0 flex-col gap-1">
              <h2 id="trip-destinations-heading" className="text-xl font-semibold text-foreground">Destinations</h2>
              {data.stops.length === 0 ? (
                <p className="text-base text-muted-foreground">No destinations yet.</p>
              ) : (
                <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base text-foreground">
                  {data.stops.map((stop, i) => (
                    <li key={stop.id} className="flex min-w-0 max-w-full items-center gap-1.5">
                      <StopDot stopIndex={i} />
                      {/* Stop names aren't length-bounded, so they wrap instead of overflowing. */}
                      <span className="min-w-0 wrap-anywhere">{stop.name}</span>
                      {i < data.stops.length - 1 && <span className="text-muted-foreground" aria-hidden>→</span>}
                    </li>
                  ))}
                </ol>
              )}
              <Link href={`/trips/${id}/stops`} className="inline-flex min-h-11 w-fit items-center text-sm font-semibold text-primary">
                Add or edit destinations
              </Link>
            </section>
            {/* A dated brief of chosen days, kept on this device for no connection (#214). */}
            {data.days.length > 0 && <TripOfflineSave tripId={id} />}
          </div>
          <div className="h-24 md:hidden @[45rem]:col-span-2" />
        </div>
      )}
    </div>
  );
}
