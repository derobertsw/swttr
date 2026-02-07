"use client";

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
  if (totalClo === undefined || !targetRange) return null;

  const [targetMin, targetMax] = targetRange;
  const { lower, upper } = getGaugeBounds(targetMin, targetMax);

  const markerPercent = toPercent(totalClo, lower, upper);
  const comfortStart = toPercent(targetMin, lower, upper);
  const comfortEnd = toPercent(targetMax, lower, upper);

  return (
    <div className="w-full">
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
          <div
            className="w-6 h-6 rounded-full bg-white border-[2.5px] border-slate-700"
            style={{
              outline: "2px solid white",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.25), 0 1px 3px rgba(0, 0, 0, 0.15)",
            }}
          />
          <span className="mt-1.5 whitespace-nowrap rounded-full bg-black/35 px-2 py-0.5 text-[10px] font-medium text-white/90">
            You {totalClo.toFixed(1)} clo
          </span>
        </div>
      </div>

      <div className="mt-1 flex items-center justify-center">
        <span className="rounded-full bg-black/35 px-2 py-0.5 text-[10px] font-semibold text-white/90">
          Target {targetMin.toFixed(1)}-{targetMax.toFixed(1)} clo
        </span>
      </div>
    </div>
  );
}
