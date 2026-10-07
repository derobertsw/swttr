"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, CalendarRange, MapPin } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlanDayCard } from "@/components/plan/PlanDayCard";
import { PlanPacking, type PackingState } from "@/components/plan/PlanPacking";
import { ACTIVITIES } from "@/data/activities";
import type { MultiDayLayerPlan, UncoveredPlanDay } from "@/types/plan";
import type { PackingListData, PackingListWardrobe } from "@/lib/packingList";
import { OutingTimeSummary } from "@/components/OutingTimeSummary";
import { WeatherSourceDetails } from "@/components/WeatherSourceDetails";
import type { Outing } from "@/types/outing";

interface MultiDayPlanDisplayProps {
  outing?: Outing;
  plan: MultiDayLayerPlan;
  /** An activity ID from src/data/activities.ts. */
  activity?: string;
  /** Where the plan is for, e.g. "Stowe, Vermont, United States". */
  place?: string;
  itemMappings?: Map<string, string>;
  /** The tab it opens on: the daily plan, unless coming back to match the packing list to a wardrobe. */
  initialTab?: "days" | "packing";
  /** Back to the form with the outing as entered. */
  onReset?: () => void;
}

function formatPlanRange(startDate: string, endDate: string): string {
  const start = format(new Date(`${startDate}T00:00:00`), "EEE, MMM d");
  const end = format(new Date(`${endDate}T00:00:00`), "EEE, MMM d");
  return start === end ? start : `${start} – ${end}`;
}

/** An hour of the day as "6am", "12pm" or "9pm". */
function formatHour(hour: number): string {
  const suffix = hour < 12 ? "am" : "pm";
  const twelveHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelveHour}${suffix}`;
}

/** Why a day in the plan's range has no layers. */
function describeUncoveredDay(day: UncoveredPlanDay, dayEndHour: number): string {
  return day.reason === "afterStartTime"
    ? `The start time is after its last daytime hour (${formatHour(dayEndHour)}).`
    : "The forecast has no daytime hours for it.";
}

/**
 * A multi-day layer plan from general guidance: the outing and the days it
 * covers, then either the daily plan (each day's conditions and what changes)
 * or the packing list for the whole plan.
 */
export default function MultiDayPlanDisplay({
  outing,
  plan,
  activity,
  place,
  itemMappings,
  initialTab = "days",
  onReset,
}: MultiDayPlanDisplayProps) {
  // `list` is null when the request failed.
  const [packingResult, setPackingResult] = useState<{
    days: MultiDayLayerPlan["days"];
    itemMappings: Map<string, string> | undefined;
    attempt: number;
    list: PackingListData | null;
    wardrobe: PackingListWardrobe;
  } | null>(null);
  const [packingAttempt, setPackingAttempt] = useState(0);

  useEffect(() => {
    let isCancelled = false;

    const fetchPackingList = async () => {
      let list: PackingListData | null = null;
      let wardrobe: PackingListWardrobe = "unavailable";
      try {
        const response = await fetch("/api/packing-list", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            days: plan.days,
            itemMappings: Object.fromEntries(itemMappings ?? new Map<string, string>()),
          }),
        });
        if (response.ok) {
          const data = await response.json() as { packingList?: PackingListData; wardrobe?: PackingListWardrobe };
          list = data.packingList ?? null;
          wardrobe = data.wardrobe ?? "unavailable";
        }
      } catch {
        // Shown as unavailable, with a retry.
      }
      if (!isCancelled) {
        setPackingResult({ days: plan.days, itemMappings, attempt: packingAttempt, list, wardrobe });
      }
    };

    void fetchPackingList();
    return () => { isCancelled = true; };
  }, [plan.days, itemMappings, packingAttempt]);

  // Loading until the stored result matches the current request; a previous
  // result stays on screen while a refetch is in flight.
  const packingLoading = packingResult?.days !== plan.days
    || packingResult?.itemMappings !== itemMappings
    || packingResult?.attempt !== packingAttempt;
  const packingState: PackingState = !packingResult
    ? { status: "loading" }
    : packingResult.list
      ? { status: "ready", list: packingResult.list, wardrobe: packingResult.wardrobe }
      : { status: "failed" };

  const activityOption = ACTIVITIES.find((candidate) => candidate.value === activity);
  const hasLayers = plan.days.some((day) => day.baseline.recommendation !== null);
  const startsLate = plan.firstDayStartHour > plan.dayStartHour;

  return (
    <section className="flex w-full flex-col gap-6 pb-24">
      <header className="flex flex-col gap-3">
        {onReset && (
          <Button type="button" variant="ghost" size="sm" className="-ml-3 self-start" onClick={onReset}>
            <ArrowLeft aria-hidden="true" />
            Edit outing
          </Button>
        )}

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h2 className="text-title font-semibold text-foreground md:text-title-lg">Multi-day layer plan</h2>
          {hasLayers && <Badge variant="neutral">General guide</Badge>}
        </div>

        <div className="flex flex-col gap-1.5">
          {activityOption && (
            <span className="inline-flex items-center gap-1.5 text-base font-semibold text-foreground">
              <activityOption.icon className="size-4" aria-hidden="true" />
              {activityOption.name}
            </span>
          )}
          {place && (
            <p className="flex items-start gap-1.5 text-sm text-foreground">
              <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              {place}
            </p>
          )}
          <p className="flex items-start gap-1.5 text-sm text-foreground">
            <CalendarRange className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>
              {formatPlanRange(plan.startDate, plan.endDate)}
              <span className="text-muted-foreground">
                {" "}· {plan.durationDays} {plan.durationDays === 1 ? "day" : "days"}
              </span>
            </span>
          </p>
          <p className="text-sm text-muted-foreground">
            Layers for {formatHour(plan.dayStartHour)} to {formatHour(plan.dayEndHour)} each day, local time.
            {startsLate && ` The first day starts at ${formatHour(plan.firstDayStartHour)}.`}
          </p>
          {outing && <OutingTimeSummary when={outing.when} />}
        </div>
        <WeatherSourceDetails provenance={plan.provenance} />
      </header>

      {plan.uncoveredDays.length > 0 && (
        <Card asChild variant="muted">
          <section aria-label="Forecast coverage" className="flex gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-base font-semibold text-foreground">
                This plan covers {plan.days.length} of {plan.durationDays} days
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">The daily plan and packing list leave out:</p>
              <ul className="mt-1 flex flex-col gap-0.5 text-sm text-foreground">
                {plan.uncoveredDays.map((day) => (
                  <li key={day.date}>
                    <span className="font-semibold">{day.label}.</span> {describeUncoveredDay(day, plan.dayEndHour)}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </Card>
      )}

      {!hasLayers && plan.days.length > 0 && (
        <Card asChild variant="muted">
          <section aria-label="No general layers" className="flex flex-col gap-0.5">
            <p className="text-base font-semibold text-foreground">
              No general layers for {activityOption?.name ?? "this activity"}
            </p>
            <p className="text-sm text-muted-foreground">
              Multi-day plans use the general layer guide, which doesn&apos;t cover it yet. Each day&apos;s forecast is below.
            </p>
          </section>
        </Card>
      )}

      <Tabs defaultValue={initialTab} className="gap-4">
        <TabsList className="grid w-full grid-cols-2 sm:max-w-sm">
          <TabsTrigger value="days">Daily plan</TabsTrigger>
          <TabsTrigger value="packing">Packing</TabsTrigger>
        </TabsList>

        <TabsContent value="days" className="flex flex-col gap-3">
          {plan.days.map((day, index) => (
            <PlanDayCard
              key={day.date}
              day={day}
              previousDay={index > 0 ? plan.days[index - 1] : undefined}
              itemMappings={itemMappings}
            />
          ))}
        </TabsContent>

        <TabsContent value="packing">
          <PlanPacking
            state={packingState}
            retrying={packingLoading && packingResult !== null}
            onRetry={() => setPackingAttempt((attempt) => attempt + 1)}
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}
