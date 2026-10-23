"use client";

import Link from "next/link";
import { Map } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTripMap } from "@/hooks/useTripMap";

/** Intentionally has no import of the map boundary or SDK. */
export function TripPlacesSummary({ tripId, revision }: { tripId: string; revision: unknown }) {
  const { data, error, loading, refresh } = useTripMap(tripId, revision);
  const shown = data?.counts.mapped;
  return <section aria-labelledby="trip-places-heading" className="flex min-w-0 flex-col items-start gap-1">
    <h2 id="trip-places-heading" className="text-xl font-semibold text-foreground">Places</h2>
    {data ? <>
      <p className="text-base text-muted-foreground">{shown} of {data.places.length} places shown</p>
      {data.places.length === 0 ? <p className="mt-1 text-base">Add a destination to see it on the map.</p> : <ul className="mt-1 space-y-1 text-base wrap-anywhere">
        {data.places.filter((place) => place.source.type === "stay" || place.source.slot === "destination").map((place) => <li key={place.id}>{place.source.type === "stay" ? "Stay" : "Destination"} · {place.name}</li>)}
      </ul>}
    </> : <p className="text-base text-muted-foreground">{loading ? "Loading places…" : "Places unavailable. The trip's days are still available."}</p>}
    {error && <Button type="button" variant="outline" className="mt-2" onClick={() => void refresh()}>Retry places</Button>}
    <Button asChild variant="outline" className="mt-2"><Link href={`/trips/${tripId}/map`}><Map aria-hidden="true" />View trip map</Link></Button>
  </section>;
}
