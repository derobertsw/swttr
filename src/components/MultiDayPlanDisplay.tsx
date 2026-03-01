"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarRange, CloudRain, Thermometer, Wind } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { DailyLayerPlan, MultiDayLayerPlan } from "@/types/plan";
import { BODY_PART_LABELS, LAYER_LABELS } from "@/lib/layers";
import type { PackingListData, MatchConfidence } from "@/lib/packingList";
import { BODY_PART_ORDER, LAYER_TYPE_ORDER } from "@/lib/packingList";

type BodyPartKey = "torso" | "legs" | "hands" | "headNeck";
type LayerType = "base" | "mid" | "outer";
type PackingView = "packOnce" | "perDay";
type PackingFilter = "all" | "gaps" | BodyPartKey;

const PACKING_FILTER_OPTIONS: Array<{ value: PackingFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "gaps", label: "Only gaps" },
  { value: "torso", label: "Torso" },
  { value: "legs", label: "Legs" },
  { value: "hands", label: "Hands" },
  { value: "headNeck", label: "Head/Neck" },
];

interface MultiDayPlanDisplayProps {
  plan: MultiDayLayerPlan;
  itemMappings?: Map<string, string>;
  onReset?: () => void;
}

function formatPlanRange(startDate: string, endDate: string): string {
  const start = format(new Date(`${startDate}T00:00:00`), "MMM d");
  const end = format(new Date(`${endDate}T00:00:00`), "MMM d");
  return start === end ? start : `${start} - ${end}`;
}

const EMPTY_PACKING_LIST: PackingListData = {
  byBodyPart: {
    torso: { base: [], mid: [], outer: [] },
    legs: { base: [], mid: [], outer: [] },
    hands: { base: [], mid: [], outer: [] },
    headNeck: { base: [], mid: [], outer: [] },
  },
  gaps: [],
  extras: [],
  totalAssignedItems: 0,
  totalRequiredSlots: 0,
};

export default function MultiDayPlanDisplay({
  plan,
  itemMappings,
  onReset,
}: MultiDayPlanDisplayProps) {
  const [packingList, setPackingList] = useState<PackingListData>(EMPTY_PACKING_LIST);
  const [packingLoading, setPackingLoading] = useState(true);
  const [packingView, setPackingView] = useState<PackingView>("packOnce");
  const [activeFilter, setActiveFilter] = useState<PackingFilter>("all");
  const [quickFixAssignments, setQuickFixAssignments] = useState<Map<string, string>>(new Map());

  const resolvedItemMappings = useMemo(() => {
    const merged = new Map(itemMappings ?? new Map<string, string>());
    quickFixAssignments.forEach((item, key) => merged.set(key, item));
    return merged;
  }, [itemMappings, quickFixAssignments]);

  useEffect(() => {
    let isCancelled = false;
    setPackingLoading(true);

    const fetchPackingList = async () => {
      try {
        const response = await fetch("/api/packing-list", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            days: plan.days,
            itemMappings: Object.fromEntries(resolvedItemMappings),
          }),
        });

        if (!response.ok) {
          if (!isCancelled) {
            setPackingList(EMPTY_PACKING_LIST);
            setPackingLoading(false);
          }
          return;
        }

        const data = await response.json() as { packingList: PackingListData };
        if (!isCancelled) {
          setPackingList(data.packingList);
          setPackingLoading(false);
        }
      } catch {
        if (!isCancelled) {
          setPackingList(EMPTY_PACKING_LIST);
          setPackingLoading(false);
        }
      }
    };

    void fetchPackingList();
    return () => { isCancelled = true; };
  }, [plan.days, resolvedItemMappings]);

  const rangeLabel = formatPlanRange(plan.startDate, plan.endDate);

  const handleFixGapsClick = () => {
    setPackingView("packOnce");
    setActiveFilter("gaps");
    const gapsPanel = document.getElementById("packing-gaps");
    gapsPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const applyLikelyMatch = (mappingKey: string, suggestion: string) => {
    setQuickFixAssignments((prev) => {
      const next = new Map(prev);
      next.set(mappingKey, suggestion);
      return next;
    });
  };

  return (
    <section className="w-full max-w-4xl space-y-4 pb-12">
      <div className="rounded-xl border border-white/35 bg-white/90 p-4 text-slate-900 shadow-[0_8px_30px_rgba(0,0,0,0.15)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Plan Ahead</p>
            <h2 className="mt-1 text-lg font-semibold">Multi-Day Layer Plan</h2>
          </div>
          {onReset ? (
            <Button type="button" variant="outline" onClick={onReset}>
              Plan Another Trip
            </Button>
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-700">
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1">
            <CalendarRange className="size-3.5" />
            {rangeLabel}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1">
            Uses {plan.dayStartHour}:00-{plan.dayEndHour}:00 local hours
          </span>
        </div>
      </div>

      <article className="rounded-xl border border-white/35 bg-white/95 p-4 text-slate-900 shadow-[0_6px_22px_rgba(0,0,0,0.12)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Clothing Packing List</h3>
            <p className="text-xs text-slate-600">Mapped and auto-matched to your wardrobe items.</p>
            {packingLoading ? (
              <p className="mt-2 text-xs text-slate-400">Loading packing list...</p>
            ) : (
              <p className="mt-2 text-xs text-slate-500">
                {packingList.totalRequiredSlots} required layer slots across this trip.
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-800">
                {packingList.totalAssignedItems} assigned
              </span>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-900">
                {packingList.gaps.length} gaps
              </span>
            </div>
            {packingList.gaps.length > 0 ? (
              <Button
                type="button"
                size="sm"
                className="h-8 bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800"
                onClick={handleFixGapsClick}
              >
                Fix {packingList.gaps.length} gaps
              </Button>
            ) : null}
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
              <button
                type="button"
                onClick={() => setPackingView("packOnce")}
                className={
                  packingView === "packOnce"
                    ? "rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-slate-900 shadow-sm"
                    : "rounded-md px-2.5 py-1 text-xs font-medium text-slate-600"
                }
              >
                Pack Once
              </button>
              <button
                type="button"
                onClick={() => setPackingView("perDay")}
                className={
                  packingView === "perDay"
                    ? "rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-slate-900 shadow-sm"
                    : "rounded-md px-2.5 py-1 text-xs font-medium text-slate-600"
                }
              >
                Per Day
              </button>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {PACKING_FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setActiveFilter(option.value)}
              className={
                activeFilter === option.value
                  ? "rounded-full border border-slate-300 bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white"
                  : "rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
              }
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {BODY_PART_ORDER.map((bodyPart) => {
            const section = packingList.byBodyPart[bodyPart];
            const hasContent = section.base.length > 0 || section.mid.length > 0 || section.outer.length > 0;
            return (
              <div
                key={bodyPart}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2.5"
              >
                <p className="text-sm font-semibold">{BODY_PART_LABELS[bodyPart]}</p>
                {hasContent ? (
                  <div className="mt-2 space-y-1.5">
                    {LAYER_TYPE_ORDER.map((layerType) =>
                      section[layerType].length > 0 ? (
                        <div key={layerType}>
                          <p className="text-xs font-medium text-slate-700">{LAYER_LABELS[layerType]}:</p>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {section[layerType].map((entry) => (
                              <span
                                key={`${entry.standardOption}:${entry.specificItem}`}
                                className={
                                  entry.source === "mapped"
                                    ? "rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-900"
                                    : "rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] text-sky-900"
                                }
                                title={`Mapped from ${entry.standardOption}`}
                              >
                                {entry.specificItem}
                                {entry.source === "auto" ? " (auto)" : ""}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">No specific items mapped yet.</p>
                )}
              </div>
            );
          })}
        </div>

        {packingList.gaps.length > 0 ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
              Gaps To Fill
            </p>
            <p className="mt-1 text-xs text-amber-900/80">
              No wardrobe match found for these slots.
            </p>
            <div className="mt-2 grid gap-2">
              {packingList.gaps.map((gap) => (
                <div
                  key={`${gap.bodyPart}:${gap.layerType}:${gap.standardOption}`}
                  className="rounded-md border border-amber-300 bg-white px-2.5 py-2 text-[11px] text-amber-950"
                >
                  <p className="font-medium">
                    {BODY_PART_LABELS[gap.bodyPart]} {LAYER_LABELS[gap.layerType]}: {gap.standardOption}
                  </p>
                  {gap.suggestions.length > 0 ? (
                    <p className="mt-0.5 text-[11px] text-amber-900/80">
                      Likely owned: {gap.suggestions.join(", ")}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-[11px] text-amber-900/70">
                      No likely wardrobe match found.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {packingList.extras.length > 0 ? (
          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Trip Extras</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {packingList.extras.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-900"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </article>

      <div className="grid gap-3">
        {plan.days.map((day) => (
          <article
            key={day.date}
            className="rounded-xl border border-white/35 bg-white/95 p-4 text-slate-900 shadow-[0_6px_22px_rgba(0,0,0,0.12)]"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold">{day.label}</h3>
                <p className="text-xs text-slate-600">{day.date}</p>
              </div>
              <div className="text-right text-xs text-slate-600">
                <p className="font-medium">Daily baseline</p>
                <p>{day.baseline.summary}</p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-700">
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1">
                <Thermometer className="size-3.5" />
                {day.baseline.minTemp}°-{day.baseline.maxTemp}°F
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1">
                <Wind className="size-3.5" />
                up to {day.baseline.maxWindSpeed} mph
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1">
                <CloudRain className="size-3.5" />
                {day.baseline.maxPrecipProbability}% precip chance
              </span>
            </div>

            <div className="mt-4 grid gap-2">
              {day.dayparts.map((daypart) => (
                <div
                  key={daypart.id}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <p className="text-sm font-medium">
                      {daypart.label} <span className="text-xs text-slate-500">({daypart.timeRangeLabel})</span>
                    </p>
                    <p className="text-xs text-slate-600">
                      {daypart.minTemp}°-{daypart.maxTemp}°F, wind {daypart.maxWindSpeed} mph
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-slate-700">{daypart.adjustment}</p>
                </div>
              ))}
            </div>

            {day.carryItems.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {day.carryItems.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-900"
                  >
                    {item}
                  </span>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
