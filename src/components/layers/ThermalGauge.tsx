"use client";

import { cn } from "@/lib/utils";

interface ThermalGaugeProps {
  totalClo: number | undefined;
  targetRange: [number, number] | undefined;
  markerLabel?: string;
  targetLabel?: string;
}

/**
 * Build a dynamic clo domain around the algorithm's target range.
 * This keeps the marker and comfort band aligned with IREQ-derived targets.
 */
function getGaugeBounds(targetMin: number, targetMax: number): { lower: number; upper: number } {
  const coldSpan = Math.max(0.6, targetMin * 0.9);
  const hotSpan = Math.max(0.6, targetMax * 0.6);
  return {
    lower: Math.max(0, targetMin - coldSpan),
    upper: targetMax + hotSpan,
  };
}

function toPercent(value: number, lower: number, upper: number): number {
  if (upper <= lower) return 50;
  const raw = ((value - lower) / (upper - lower)) * 100;
  return Math.max(0, Math.min(100, raw));
}

/**
 * Visual gauge showing user's thermal position on a cold-to-hot spectrum.
 * Uses color gradient and marker to communicate thermal comfort at a glance.
 */
export function ThermalGauge({
  totalClo,
  targetRange,
  markerLabel = "You",
  targetLabel = "Target",
}: ThermalGaugeProps) {
  if (totalClo === undefined || !targetRange) return null;

  const [targetMin, targetMax] = targetRange;
  const { lower, upper } = getGaugeBounds(targetMin, targetMax);
  const CLO_EPSILON = 0.05;

  const markerPercent = toPercent(totalClo, lower, upper);
  const comfortStart = toPercent(targetMin, lower, upper);
  const comfortEnd = toPercent(targetMax, lower, upper);
  const deficitRaw = targetMin - totalClo;
  const surplusRaw = totalClo - targetMax;
  const deficit = deficitRaw > CLO_EPSILON ? deficitRaw : 0;
  const surplus = surplusRaw > CLO_EPSILON ? surplusRaw : 0;
  const statusText =
    deficit > 0
      ? `Need +${deficit.toFixed(1)} clo`
      : surplus > 0
        ? `Over by ${surplus.toFixed(1)} clo`
        : "In target range";
  const statusClass =
    deficit > 0
      ? "border-sky-200 bg-sky-50/95 text-sky-800"
      : surplus > 0
        ? "border-amber-200 bg-amber-50/95 text-amber-800"
        : "border-emerald-200 bg-emerald-50/95 text-emerald-800";
  const markerLabelClass =
    markerPercent < 10
      ? "translate-x-0"
      : markerPercent > 90
        ? "-translate-x-full"
        : "-translate-x-1/2";
  const markerText = markerLabel
    ? `${markerLabel} ${totalClo.toFixed(1)} clo`
    : `${totalClo.toFixed(1)} clo`;

  return (
    <div className="w-full">
      <div className={cn("mb-2 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold", statusClass)}>
        {statusText}
      </div>
      <div className="mb-1.5 flex justify-between text-xs text-white/70">
        <span>Cold</span>
        <span className="text-white/75">Comfortable</span>
        <span>Hot</span>
      </div>

      <div
        className="relative h-2.5 rounded-full mb-6"
        style={{
          background: "linear-gradient(to right, #6BAADB 0%, #7DC4A8 35%, #A8C9A0 50%, #C9C490 65%, #D4B87A 100%)",
        }}
      >
        <div
          className="absolute inset-y-0 rounded-full border border-white/35 bg-white/22 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]"
          style={{
            left: `${comfortStart}%`,
            width: `${comfortEnd - comfortStart}%`,
          }}
        />

        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center"
          style={{
            left: `${markerPercent}%`,
          }}
        >
          <span
            className={cn(
              "absolute -top-7 left-0 whitespace-nowrap rounded-full bg-black/35 px-2 py-0.5 text-[10px] font-medium text-white/95",
              markerLabelClass
            )}
          >
            {markerText}
          </span>
          <div
            className="w-6 h-6 rounded-full bg-white border-[2.5px] border-slate-700"
            style={{
              outline: "2px solid white",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.25), 0 1px 3px rgba(0, 0, 0, 0.15)",
            }}
          />
        </div>
      </div>

      <div className="mt-1 flex items-center justify-center">
        <span className="rounded-full bg-black/35 px-2 py-0.5 text-[10px] font-semibold text-white/90">
          {targetLabel} {targetMin.toFixed(1)}-{targetMax.toFixed(1)} clo
        </span>
      </div>
    </div>
  );
}
