"use client";

import { useCallback, useRef, useState } from "react";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CloBreakdownLine {
  label: string;
  detail: string;
}

export interface CloBreakdown {
  lines: CloBreakdownLine[];
  total: number;
}

interface ThermalGaugeProps {
  totalClo: number | undefined;
  targetRange: [number, number] | undefined;
  markerLabel?: string;
  showStatusPill?: boolean;
  hideMarkerLabel?: boolean;
  cloBreakdown?: CloBreakdown;
}

const LONG_PRESS_MS = 400;

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
  showStatusPill = true,
  hideMarkerLabel = false,
  cloBreakdown,
}: ThermalGaugeProps) {
  const [showClo, setShowClo] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startPress = useCallback(() => {
    timerRef.current = setTimeout(() => {
      setShowClo(true);
    }, LONG_PRESS_MS);
  }, []);

  const endPress = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setShowClo(false);
  }, []);

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
      ? "border-sky-500 bg-sky-200 text-sky-950"
      : surplus > 0
        ? "border-amber-500 bg-amber-200 text-amber-950"
        : "border-emerald-500 bg-emerald-200 text-emerald-950";
  const markerLabelClass =
    markerPercent < 10
      ? "translate-x-0"
      : markerPercent > 90
        ? "-translate-x-full"
        : "-translate-x-1/2";
  const markerText = markerLabel
    ? `${markerLabel} ${totalClo.toFixed(1)} clo`
    : `${totalClo.toFixed(1)} clo`;

  const showMarker = !hideMarkerLabel || showClo;

  return (
    <div className="w-full select-none">
      {showStatusPill && (
        <div className={cn("mb-2 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold", statusClass)}>
          {statusText}
        </div>
      )}
      <div className="mb-1.5 flex justify-between text-xs text-white/70">
        <span>Cold</span>
        <span className="text-white/75">Comfortable</span>
        <span>Hot</span>
      </div>

      <div
        className="relative h-2.5 rounded-full mb-6 touch-none"
        style={{
          background: "linear-gradient(to right, #6BAADB 0%, #7DC4A8 35%, #A8C9A0 50%, #C9C490 65%, #D4B87A 100%)",
        }}
        onMouseDown={hideMarkerLabel ? startPress : undefined}
        onMouseUp={hideMarkerLabel ? endPress : undefined}
        onMouseLeave={hideMarkerLabel ? endPress : undefined}
        onTouchStart={hideMarkerLabel ? startPress : undefined}
        onTouchEnd={hideMarkerLabel ? endPress : undefined}
        onTouchCancel={hideMarkerLabel ? endPress : undefined}
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
          {showMarker && (
            <span
              className={cn(
                "absolute -top-7 left-0 whitespace-nowrap rounded-full bg-black/35 px-2 py-0.5 text-[10px] font-medium text-white/95 transition-opacity duration-150",
                markerLabelClass,
                showClo && hideMarkerLabel ? "animate-in fade-in" : ""
              )}
            >
              {markerText}
            </span>
          )}
          <div
            className="w-6 h-6 rounded-full bg-white border-[2.5px] border-slate-700"
            style={{
              outline: "2px solid white",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.25), 0 1px 3px rgba(0, 0, 0, 0.15)",
            }}
          />
        </div>
      </div>

      <div className="mt-1 flex items-center justify-center gap-1.5">
        <span className="rounded-full bg-black/35 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-white/80">
          Target {targetMin.toFixed(1)}-{targetMax.toFixed(1)} clo
        </span>
        <span className={cn(
          "rounded-full border px-2 py-0.5 text-[10px] font-bold tabular-nums",
          deficit > 0
            ? "border-sky-400 bg-sky-500/40 text-sky-100"
            : surplus > 0
              ? "border-amber-400 bg-amber-500/40 text-amber-100"
              : "border-emerald-400 bg-emerald-500/40 text-emerald-100"
        )}>
          Actual {totalClo.toFixed(1)} clo
        </span>
        {cloBreakdown && (
          <button
            type="button"
            onClick={() => setShowBreakdown((prev) => !prev)}
            className="flex items-center justify-center rounded-full text-white/50 hover:text-white/80 transition-colors"
            aria-label="Show insulation breakdown"
          >
            <HelpCircle className="size-3.5" />
          </button>
        )}
      </div>

      {showBreakdown && cloBreakdown && (
        <div className="mt-2 rounded-lg bg-black/25 px-3 py-2 text-[10px] tabular-nums text-white/75">
          <div className="space-y-0.5 font-mono">
            {cloBreakdown.lines.map((line) => (
              <div key={line.label} className="flex justify-between">
                <span>{line.label}</span>
                <span>{line.detail}</span>
              </div>
            ))}
            <div className="mt-1 border-t border-white/15 pt-1 flex justify-between font-semibold text-white/90">
              <span>Total</span>
              <span>{cloBreakdown.total.toFixed(2)} clo</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
