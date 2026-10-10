"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { segmentedGroupClassName, segmentedItemClassName } from "@/components/ui/segmented";
import { BodyPartSection } from "@/components/layers";
import { CarryCard } from "@/components/layers/CarryCard";
import { ComfortDecision } from "@/components/layers/ComfortDecision";
import { ResultHeader } from "@/components/layers/ResultHeader";
import { generalAdviceReason } from "@/components/trips/SaveToTrip";
import { BODY_PARTS } from "@/lib/layers";
import { outfitMismatches } from "@/lib/trip-kit-fit";
import { cn } from "@/lib/utils";
import type { SavedKitPhase, SavedOutfit } from "@/types/savedKit";
import type { TripStop } from "@/types/trips";

const PHASE_LABELS: Record<SavedKitPhase["id"], string> = { outing: "Outing", climb: "Climb", descent: "Descent" };
const noop = () => {};

interface SavedKitViewProps {
  outfit: SavedOutfit;
  savedAt?: string | null;
  /** The trip day it's on, to point out an outfit planned for another place, date or activity. */
  day: { date: string; activity: string | null; stop: TripStop | null };
}

/**
 * My kit on a trip day (#170): the outfit saved from Gear up, shown as Gear up
 * showed it, with the outing and forecast it was for. It's a snapshot, so it
 * says when it was saved, doesn't change with newer weather, and says when it
 * was planned for another place, date or activity than the day's (#176).
 */
export function SavedKitView({ outfit, savedAt, day }: SavedKitViewProps) {
  const [phaseId, setPhaseId] = useState(outfit.phases[0].id);
  const wearHeadingId = useId();
  const phase = outfit.phases.find((candidate) => candidate.id === phaseId) ?? outfit.phases[0];
  const touring = outfit.phases.length > 1;
  const phaseLabel = touring ? PHASE_LABELS[phase.id] : undefined;
  const reason = generalAdviceReason(outfit);
  const mismatches = outfitMismatches(outfit, day);

  return (
    <section aria-label="My kit" className="flex flex-col gap-5">
      <ResultHeader
        title="My kit"
        outing={outfit.outing}
        activity={outfit.outing.activity}
        exertion={outfit.outing.exertion}
        adviceKind={outfit.advice.kind}
        temperature={outfit.weather.temperature}
        windspeed={outfit.weather.windSpeed}
        precipitation={outfit.weather.precipitation}
        precipitationType={outfit.weather.precipitationType}
        context={outfit.weather.context}
      />

      <Card variant="muted" className="flex flex-col gap-1 text-sm">
        <p className="text-foreground">
          {savedAt ? `Saved ${format(new Date(savedAt), "MMM d 'at' h:mm a")} from Gear up` : "Saved from Gear up"}
          {outfit.edited && ", with your changes"}. It stays as saved when the forecast changes.
        </p>
        {reason && <p className="text-muted-foreground">{reason}</p>}
        {mismatches.map((note) => <p key={note} className="text-foreground">{note}</p>)}
        <p className="text-muted-foreground">
          To update it, <Link href="/" className="font-medium text-foreground underline underline-offset-2">get layers in Gear up</Link> and save them to this day.
        </p>
      </Card>

      {touring && (
        <div role="group" aria-label="Phase" className={cn(segmentedGroupClassName, "grid-cols-2")}>
          {outfit.phases.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              aria-pressed={candidate.id === phase.id}
              onClick={() => setPhaseId(candidate.id)}
              className={segmentedItemClassName}
            >
              {PHASE_LABELS[candidate.id]}
            </button>
          ))}
        </div>
      )}

      <ComfortDecision decision={phase.decision} phase={phaseLabel} />

      <section aria-labelledby={wearHeadingId} className="flex flex-col gap-3">
        <h3 id={wearHeadingId} className="text-xl font-semibold text-foreground">Wear</h3>
        <Card padding="none" className="divide-y divide-border px-4">
          {BODY_PARTS.map((bodyPart) => (
            <BodyPartSection
              key={bodyPart}
              bodyPart={bodyPart}
              layers={phase.wear[bodyPart]}
              readOnly
              currentClo={undefined}
              targetClo={undefined}
              onItemTap={noop}
              onItemRemove={noop}
              onAddLayer={noop}
            />
          ))}
        </Card>
      </section>

      {touring && phase.id !== "outing" && <CarryCard items={phase.carry} phase={phase.id} />}
    </section>
  );
}
