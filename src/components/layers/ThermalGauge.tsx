interface ThermalGaugeProps {
  totalClo: number | undefined;
  targetRange: [number, number] | undefined;
}

/**
 * Calculates the thermal position on a -1 to +1 scale
 * -1 = severely under-insulated (cold)
 *  0 = perfectly insulated (comfortable)
 * +1 = over-insulated (hot)
 */
function calculateThermalPosition(
  totalClo: number,
  targetMin: number,
  targetNeutral: number
): number {
  const targetMax = targetNeutral * 1.3;

  if (totalClo < targetMin) {
    const underRange = targetMin;
    const position = -1 + (totalClo / underRange) * 0.8;
    return Math.max(-1, position);
  } else if (totalClo <= targetNeutral) {
    const range = targetNeutral - targetMin;
    const position = ((totalClo - targetMin) / range) * 0.2 - 0.2;
    return position;
  } else if (totalClo <= targetMax) {
    const range = targetMax - targetNeutral;
    const position = ((totalClo - targetNeutral) / range) * 0.5;
    return position;
  } else {
    const excess = totalClo - targetMax;
    const position = 0.5 + Math.min(excess / targetNeutral, 0.5);
    return Math.min(1, position);
  }
}

/**
 * Visual gauge showing user's thermal position on a cold-to-hot spectrum.
 * Uses color gradient and marker to communicate thermal comfort at a glance.
 */
export function ThermalGauge({ totalClo, targetRange }: ThermalGaugeProps) {
  if (totalClo === undefined || !targetRange) return null;

  const [targetMin, targetNeutral] = targetRange;
  const position = calculateThermalPosition(totalClo, targetMin, targetNeutral);

  const markerPercent = ((position + 1) / 2) * 100;

  const comfortStart = 40;
  const comfortEnd = 60;

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
            animation: "gauge-thumb-enter 0.4s ease-out",
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
