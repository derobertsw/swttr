"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import PageLayout from "@/components/PageLayout";
import { TripStopsEditor } from "@/components/trips/LegacyTripWizard";
import { Button } from "@/components/ui/button";
import { useTrip } from "@/hooks/useTrip";
import type { TripStop } from "@/types/trips";

export default function TripStopsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data, loading, error, refresh } = useTrip(id);
  const [editedStops, setEditedStops] = useState<TripStop[] | null>(null);
  const overview = () => router.push(`/trips/${encodeURIComponent(id)}`);
  return <PageLayout chromeVariant="compact"><div className="flex w-full max-w-2xl flex-col gap-5 pb-24">
    <header><h1 className="text-3xl font-semibold">Destinations</h1><p className="mt-2 text-sm text-muted-foreground">Add a stop, then choose the days that use it.</p></header>
    {loading && <p role="status">Loading destinations…</p>}
    {error && <div role="alert"><p>{error}</p><Button variant="outline" onClick={() => void refresh()}>Retry</Button></div>}
    {data && <TripStopsEditor trip={data.trip} stops={editedStops ?? data.stops} onStopsChange={(action) => setEditedStops((current) => typeof action === "function" ? action(current ?? data.stops) : action)} onBack={overview} onNext={overview} backLabel="Overview" nextLabel="Done" />}
  </div></PageLayout>;
}
