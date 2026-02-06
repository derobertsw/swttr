"use client";

import { useEffect, useState } from "react";

interface ThermalGaugeProps {
  totalClo: number | undefined;
  targetRange: [number, number] | undefined;
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
export function ThermalGauge({ totalClo, targetRange }: ThermalGaugeProps) {
  const [markerReady, setMarkerReady] = useState(false);

  useEffect(() => {
    setMarkerReady(true);
  }, []);

  if (totalClo === undefined || !targetRange) return null;

  const [targetMin, targetMax] = targetRange;
  const { lower, upper } = getGaugeBounds(targetMin, targetMax);

  const markerPercent = toPercent(totalClo, lower, upper);
  const comfortStart = toPercent(targetMin, lower, upper);
  const comfortEnd = toPercent(targetMax, lower, upper);

  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-slate-500 mb-1.5">
        <span>Cold</span>
        <span className="text-slate-400">Comfortable</span>
        <span>Hot</span>
      </div>

      <div
        className="relative h-2.5 rounded-full mb-6"
        style={{
          background: "linear-gradient(to right, #6BAADB 0%, #7DC4A8 35%, #A8C9A0 50%, #C9C490 65%, #D4B87A 100%)",
        }}
      >
        <div
          className="absolute inset-y-0 rounded-full"
          style={{
            left: `${comfortStart}%`,
            width: `${comfortEnd - comfortStart}%`,
            background: "rgba(255, 255, 255, 0.12)",
            boxShadow: "inset 0 0 0 1px rgba(255, 255, 255, 0.15)",
          }}
        />

        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center"
          style={{
            left: `${markerPercent}%`,
            opacity: markerReady ? 1 : 0,
            transition: markerReady
              ? "left 240ms ease-out, opacity 120ms ease-out"
              : "none",
          }}
        >
          <div
            className="w-6 h-6 rounded-full bg-white border-[2.5px] border-slate-700"
            style={{
              outline: "2px solid white",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.25), 0 1px 3px rgba(0, 0, 0, 0.15)",
            }}
          />
          <span className="text-[10px] text-slate-500 mt-1.5 whitespace-nowrap font-medium">You</span>
        </div>
      </div>
    </div>
  );
}
