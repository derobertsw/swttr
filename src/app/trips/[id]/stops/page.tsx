"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import PageLayout from "@/components/PageLayout";
import { TripStopsEditor } from "@/components/trips/LegacyTripWizard";
import { TripDaysEditor } from "@/components/trips/TripDaysEditor";
import { Button } from "@/components/ui/button";
import { useTrip } from "@/hooks/useTrip";
import type { TripStop } from "@/types/trips";

export default function TripStopsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data, loading, error, refresh } = useTrip(id);
  const [editedStops, setEditedStops] = useState<TripStop[] | null>(null);
  const overview = () => router.push(`/trips/${encodeURIComponent(id)}`);
  // Stops and days changed on the server: show both as saved.
  const reload = async () => {
    await refresh();
    setEditedStops(null);
  };
  const stops = data && (editedStops ?? data.stops);
  return <PageLayout chromeVariant="compact"><div className="flex w-full max-w-2xl flex-col gap-5 pb-24">
    <header><h1 className="text-title font-semibold text-foreground md:text-title-lg">Destinations</h1><p className="mt-2 text-sm text-muted-foreground">Add, order and remove stops, then choose the days that use them.</p></header>
    {loading && !data && <p role="status">Loading destinations…</p>}
    {error && <div role="alert"><p>{error}</p><Button variant="outline" onClick={() => void refresh()}>Retry</Button></div>}
    {data && stops && (
      <TripStopsEditor trip={data.trip} stops={stops} onStopsChange={(action) => setEditedStops((current) => typeof action === "function" ? action(current ?? data.stops) : action)} onItineraryChange={() => void reload()} onBack={overview} onNext={overview} backLabel="Overview" nextLabel="Done">
        <TripDaysEditor tripId={id} stops={stops} days={data.days} onSaved={() => void reload()} />
      </TripStopsEditor>
    )}
  </div></PageLayout>;
}
