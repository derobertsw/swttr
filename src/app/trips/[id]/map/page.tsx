"use client";

import { Suspense, use } from "react";
import { useSearchParams } from "next/navigation";
import { BackLink, TripError } from "@/components/trips/trip-primitives";
import { TripMapView } from "@/components/trips/TripMapView";
import { Button } from "@/components/ui/button";
import { useTrip } from "@/hooks/useTrip";
import { useTripMap } from "@/hooks/useTripMap";
import { useUserId } from "@/hooks/useUserId";
import type { TripDay } from "@/types/trips";

export default function TripMapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const trip = useTrip(id);
  const map = useTripMap(trip.data ? id : null, trip.data);
  const userId = useUserId();
  // The workspace header names the trip, and Plan is the current section.
  return (
    <div className="w-full min-w-0 space-y-5">
      <Suspense fallback={<BackLink href={`/trips/${id}`}>Back to Plan</BackLink>}><MapBackLink tripId={id} days={trip.data?.days} /></Suspense>
      <header><h1 className="text-title font-semibold">Trip map</h1></header>
      {trip.error && <TripError>{trip.error}</TripError>}
      {map.error && <div className="space-y-2"><TripError>{map.error.message}</TripError>{map.data && <p className="text-base text-muted-foreground">Showing previously loaded places. Changes may be missing until you reconnect and retry.</p>}<Button variant="outline" onClick={() => void map.refresh()}>Retry places</Button></div>}
      {(!trip.data || !map.data) && !trip.error && !map.error && <p role="status">Loading trip places…</p>}
      {trip.data && map.data && <Suspense fallback={<p>Loading map view…</p>}><TripMapView key={map.data.trip.id} data={map.data} canEdit={trip.data.trip.owner_user_id === userId}
        memberId={trip.data.members.find((member) => member.user_id !== null && member.user_id === userId && member.status !== "left")?.id ?? null} /></Suspense>}
    </div>
  );
}

/**
 * Opened from a day's Getting there: back to the selected day while the trip
 * still has it. A saved link that outlived its day goes back to Plan.
 */
function MapBackLink({ tripId, days }: { tripId: string; days: TripDay[] | undefined }) {
  const params = useSearchParams();
  const date = params.get("date");
  return params.get("from") === "day" && days?.some((day) => day.date === date)
    ? <BackLink href={`/trips/${tripId}/days/${date}`}>Back to day</BackLink>
    : <BackLink href={`/trips/${tripId}`}>Back to Plan</BackLink>;
}
