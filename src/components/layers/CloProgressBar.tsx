interface CloProgressBarProps {
  currentClo: number | undefined;
  targetClo: number;
}

/**
 * Visual progress bar showing insulation level relative to target.
 * Color scheme (no red - red is reserved for global risk only):
 * - Sky blue: under target (< 80% of target)
 * - Emerald: near target (80-100% of target)
 * - Amber: over target (> 100% of target)
 */
export function CloProgressBar({ currentClo, targetClo }: CloProgressBarProps) {
  const displayClo = currentClo ?? 0;
  const ratio = displayClo / targetClo;
  const percentage = Math.min(ratio * 100, 100);

  const getBarColor = () => {
    if (ratio < 0.8) return "bg-sky-500";
    if (ratio <= 1) return "bg-emerald-500";
    return "bg-amber-500";
  };

  const getTextColor = () => {
    if (ratio < 0.8) return "text-sky-700";
    if (ratio <= 1) return "text-emerald-700";
    return "text-amber-700";
  };

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${getBarColor()}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className={`text-xs font-mono ${getTextColor()}`}>
        {displayClo.toFixed(1)}/{targetClo.toFixed(1)} clo
      </span>
    </div>
  );
}
