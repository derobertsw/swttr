"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { CalendarRange, MapPin, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { segmentedGroupClassName, segmentedItemClassName } from "@/components/ui/segmented";
import { BodyPartSection } from "@/components/layers";
import { CarryCard } from "@/components/layers/CarryCard";
import { ComfortDecision } from "@/components/layers/ComfortDecision";
import { ResultHeader } from "@/components/layers/ResultHeader";
import { formatHour } from "@/components/MultiDayPlanDisplay";
import { PlanDayCard } from "@/components/plan/PlanDayCard";
import { generalAdviceReason } from "@/components/trips/SaveToTrip";
import { WeatherSourceDetails } from "@/components/WeatherSourceDetails";
import { ACTIVITIES } from "@/data/activities";
import { useUserId } from "@/hooks/useUserId";
import { formatLocationName } from "@/hooks/useLocationSearch";
import { EXERTION_LABELS } from "@/lib/biophysics/exertion";
import { addDaysToDateString } from "@/lib/forecastRange";
import { keepOutingForGearUp } from "@/lib/gearUpDraft";
import { BODY_PARTS } from "@/lib/layers";
import { resumeUpdatePath } from "@/lib/outingReturn";
import { kitAdvice, outingToUpdate } from "@/lib/trip-saved-kits";
import { cn } from "@/lib/utils";
import type { SavedKit, SavedKitPhase, SavedOutfit, SavedPlanDay } from "@/types/savedKit";
import type { TripStop } from "@/types/trips";

const PHASE_LABELS: Record<SavedKitPhase["id"], string> = { outing: "Outing", climb: "Climb", descent: "Descent" };
const noop = () => {};

/** "Sat, Oct 10" for a "yyyy-MM-dd" date. */
const formatDay = (date: string) => format(new Date(`${date}T00:00:00`), "EEE, MMM d");

/** Within about 1 km: the saved outing's place and the day's stop are the same place. */
function samePlace(kit: SavedKit, stop: TripStop): boolean {
  return stop.latitude !== null && stop.longitude !== null
    && Math.abs(stop.latitude - kit.outing.place.latitude) < 0.01
    && Math.abs(stop.longitude - kit.outing.place.longitude) < 0.01;
}

interface SavedKitViewProps {
  /** The saved outing outfit, or plan day. */
  outfit: SavedKit;
  savedAt?: string | null;
  /** The day's stop, to point out a kit saved for somewhere else. */
  stop?: TripStop | null;
  /** The trip and day it's saved to, which updating it saves back to. */
  tripId: string;
  date: string;
}

/**
 * My kit on a trip day (#170): the outfit or plan day saved from Gear up,
 * shown as Gear up showed it, with the outing and forecast it was for. It's a
 * snapshot, so it says when it was saved and doesn't change with newer
 * weather. Update in Gear up asks for layers again for the same outing.
 */
export function SavedKitView({ outfit, savedAt, stop, tripId, date }: SavedKitViewProps) {
  const note = <SavedNote kit={outfit} savedAt={savedAt} stop={stop} tripId={tripId} date={date} />;
  return outfit.kind === "plan_day"
    ? <SavedPlanDayView kit={outfit} note={note} />
    : <SavedOutfitView outfit={outfit} note={note} />;
}

function SavedOutfitView({ outfit, note }: { outfit: SavedOutfit; note: React.ReactNode }) {
  const [phaseId, setPhaseId] = useState(outfit.phases[0].id);
  const wearHeadingId = useId();
  const phase = outfit.phases.find((candidate) => candidate.id === phaseId) ?? outfit.phases[0];
  const touring = outfit.phases.length > 1;
  const phaseLabel = touring ? PHASE_LABELS[phase.id] : undefined;

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

      {note}

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

/** A day of a multi-day plan, as the plan showed it: the outing, then the day's card. */
function SavedPlanDayView({ kit, note }: { kit: SavedPlanDay; note: React.ReactNode }) {
  const { outing } = kit;
  const activity = ACTIVITIES.find((option) => option.value === outing.activity);
  const { date, durationDays } = outing.when;
  const end = addDaysToDateString(date, durationDays - 1);
  let dayNumber = 1;
  while (addDaysToDateString(date, dayNumber - 1) < kit.day.date) dayNumber += 1;

  return (
    <section aria-label="My kit" className="flex flex-col gap-5">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h2 className="text-title font-semibold text-foreground md:text-title-lg">My kit</h2>
          <Badge variant="neutral">General guide</Badge>
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base">
            {activity && (
              <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                <activity.icon className="size-4" aria-hidden="true" />
                {activity.name}
              </span>
            )}
            <span className="text-muted-foreground">{EXERTION_LABELS[outing.exertion]} effort</span>
          </p>
          <p className="flex items-start gap-1.5 text-sm text-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            {formatLocationName(outing.place)}
          </p>
          <p className="flex items-start gap-1.5 text-sm text-foreground">
            <CalendarRange className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>
              Day {dayNumber} of a {durationDays}-day plan
              <span className="text-muted-foreground"> · {formatDay(date)} – {formatDay(end)}</span>
            </span>
          </p>
          <p className="text-sm text-muted-foreground">
            Layers for {formatHour(kit.startHour)} to {formatHour(kit.endHour)}, local time.
          </p>
        </div>
        <WeatherSourceDetails provenance={kit.provenance} />
      </header>

      {note}

      <PlanDayCard day={kit.day} />
    </section>
  );
}

/** When and how the kit was saved, what it's for, and how to update it. */
function SavedNote({ kit, savedAt, stop, tripId, date }: Omit<SavedKitViewProps, "outfit"> & { kit: SavedKit }) {
  const reason = generalAdviceReason(kit.outing.activity, kitAdvice(kit));
  const elsewhere = stop && !samePlace(kit, stop);
  const from = kit.kind === "plan_day" ? `from a ${kit.outing.when.durationDays}-day plan in Gear up` : "from Gear up";
  return (
    <Card variant="muted" className="flex flex-col gap-1 text-sm">
      <p className="text-foreground">
        {savedAt ? `Saved ${format(new Date(savedAt), "MMM d 'at' h:mm a")} ${from}` : `Saved ${from}`}
        {kit.kind !== "plan_day" && kit.edited && ", with your changes"}. It stays as saved when the forecast changes.
      </p>
      {reason && <p className="text-muted-foreground">{reason}</p>}
      {elsewhere && (
        <p className="text-muted-foreground">
          Saved for {(kit.kind !== "plan_day" && kit.weather.context?.place) || kit.outing.place.name}, not this day&apos;s stop ({stop.name}).
        </p>
      )}
      <UpdateInGearUp kit={kit} tripId={tripId} date={date} />
    </Card>
  );
}

/**
 * Asks Gear up for layers for the kit's outing again, with Save to trip
 * picking this trip, so saving them shows what changes before replacing the
 * kit. Not offered once the day has passed at the destination.
 */
function UpdateInGearUp({ kit, tripId, date }: { kit: SavedKit; tripId: string; date: string }) {
  const router = useRouter();
  const userId = useUserId();
  // Whether the day has passed is judged as of when the page opened.
  const [now] = useState(() => Date.now());
  const outing = outingToUpdate(kit, date, now);
  if (!outing || !userId) return null;
  const plan = outing.when.mode === "later" && outing.when.durationDays > 1;
  return (
    <div className="mt-2 flex flex-col items-start gap-2">
      <p className="text-muted-foreground">
        {plan
          ? "Update plans the outing again. Saving it to this trip shows what changes on each day before anything is replaced."
          : "Update gets layers again for this outing. Saving them to this day shows what changes before anything is replaced."}
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          keepOutingForGearUp(userId, outing);
          router.push(resumeUpdatePath(tripId));
        }}
      >
        <RefreshCw aria-hidden="true" />
        Update in Gear up
      </Button>
    </div>
  );
}
