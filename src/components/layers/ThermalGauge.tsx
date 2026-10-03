"use client";

import { useCallback, useRef, useState } from "react";
import { HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
  const statusVariant = deficit > 0 || surplus > 0 ? "warning" : "success";
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
        <Badge size="sm" variant={statusVariant} className="mb-2">
          {statusText}
        </Badge>
      )}
      <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
        <span>Cold</span>
        <span>Comfortable</span>
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
          className="absolute inset-y-0 rounded-full ring-2 ring-foreground"
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
              className={[
                "absolute -top-7 left-0 whitespace-nowrap rounded-full border border-border bg-popover px-2 py-0.5 text-xs font-medium text-popover-foreground",
                markerLabelClass,
                showClo && hideMarkerLabel ? "animate-in fade-in" : "",
              ].join(" ")}
            >
              {markerText}
            </span>
          )}
          <div className="size-6 rounded-full border-[2.5px] border-foreground bg-card shadow-md" />
        </div>
      </div>

      <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5">
        <Badge size="sm" variant="neutral" className="tabular-nums">
          Target {targetMin.toFixed(1)}-{targetMax.toFixed(1)} clo
        </Badge>
        <Badge size="sm" variant={statusVariant} className="tabular-nums">
          Actual {totalClo.toFixed(1)} clo
        </Badge>
        {cloBreakdown && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setShowBreakdown((prev) => !prev)}
            className="text-muted-foreground"
            aria-label="Show insulation breakdown"
            aria-expanded={showBreakdown}
          >
            <HelpCircle aria-hidden="true" />
          </Button>
        )}
      </div>

      {showBreakdown && cloBreakdown && (
        <div className="mt-2 rounded-control bg-muted px-3 py-2 text-xs tabular-nums text-foreground">
          <div className="space-y-0.5 font-mono">
            {cloBreakdown.lines.map((line) => (
              <div key={line.label} className="flex justify-between">
                <span>{line.label}</span>
                <span>{line.detail}</span>
              </div>
            ))}
            <div className="mt-1 flex justify-between border-t border-border pt-1 font-semibold">
              <span>Total</span>
              <span>{cloBreakdown.total.toFixed(2)} clo</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
