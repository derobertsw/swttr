"use client";

import { Suspense, use } from "react";
import PageLayout from "@/components/PageLayout";
import { BackLink, TripError } from "@/components/trips/trip-primitives";
import { TripMapView } from "@/components/trips/TripMapView";
import { Button } from "@/components/ui/button";
import { useTrip } from "@/hooks/useTrip";
import { useTripMap } from "@/hooks/useTripMap";
import { useUserId } from "@/hooks/useUserId";

export default function TripMapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const trip = useTrip(id);
  const map = useTripMap(trip.data ? id : null, trip.data);
  const userId = useUserId();
  return <PageLayout chromeVariant="compact">
    <div className="w-full min-w-0 space-y-5">
      <BackLink href={`/trips/${id}`}>Back to overview</BackLink>
      <header><p className="text-sm text-muted-foreground">Overview · Places</p><h1 className="mt-1 text-title font-semibold wrap-anywhere">{trip.data?.trip.name ?? "Trip map"}</h1></header>
      {trip.error && <TripError>{trip.error}</TripError>}
      {map.error && <div className="space-y-2"><TripError>{map.error.message}</TripError>{map.data && <p className="text-base text-muted-foreground">Showing previously loaded places. Changes may be missing until you reconnect and retry.</p>}<Button variant="outline" onClick={() => void map.refresh()}>Retry places</Button></div>}
      {(!trip.data || !map.data) && !trip.error && !map.error && <p role="status">Loading trip places…</p>}
      {trip.data && map.data && <Suspense fallback={<p>Loading map view…</p>}><TripMapView key={map.data.trip.id} data={map.data} canEdit={trip.data.trip.owner_user_id === userId} /></Suspense>}
    </div>
  </PageLayout>;
}
