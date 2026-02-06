import { AlertTriangle, Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RegionalClo } from "@/types/biophysics";
import { cn } from "@/lib/utils";

interface ThermalStatusCardProps {
  totalClo: number | undefined;
  targetRange: [number, number] | undefined;
  regionalClo?: RegionalClo;
}

/**
 * Determines thermal status using the algorithm's target range.
 */
function getThermalRiskLevel(totalClo: number, targetMin: number, targetMax: number): {
  riskType: "comfortable" | "cold" | "overheat";
  severity: "moderate" | "high";
  delta: number;
} {
  if (totalClo >= targetMin && totalClo <= targetMax) {
    return { riskType: "comfortable", severity: "moderate", delta: 0 };
  }

  const rangeWidth = Math.max(0.2, targetMax - targetMin);

  if (totalClo < targetMin) {
    const deficit = targetMin - totalClo;
    const severity = deficit <= rangeWidth ? "moderate" : "high";
    return { riskType: "cold", severity, delta: deficit };
  }

  const excess = totalClo - targetMax;
  const severity = excess <= rangeWidth ? "moderate" : "high";
  return { riskType: "overheat", severity, delta: excess };
}

/**
 * Returns recommendation text for cold or over-insulated conditions.
 */
function getRecommendation(riskType: "cold" | "overheat", severity: "moderate" | "high"): string {
  if (riskType === "cold") {
    if (severity === "high") return "Add substantial insulation (warmer base + midlayer).";
    return "Add a light-to-mid insulation layer.";
  }
  if (severity === "high") return "Reduce insulation and increase ventilation immediately.";
  return "Consider dropping one layer or opening vents.";
}

interface CloInfoPopoverProps {
  regionalClo: RegionalClo;
  totalClo: number | undefined;
}

function CloInfoPopover({ regionalClo, totalClo }: CloInfoPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="text-slate-400 hover:text-slate-600">
          <Info className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="space-y-2">
          <h4 className="font-medium text-sm">How overall clo is calculated</h4>
          <p className="text-xs text-muted-foreground">
            Overall insulation is a weighted average of body regions:
          </p>
          <div className="text-xs font-mono bg-muted p-2 rounded space-y-1">
            <div>Torso: {regionalClo.torso.toFixed(2)} clo x 50%</div>
            <div>Arms: {regionalClo.arms.toFixed(2)} clo x 25%</div>
            <div>Legs: {regionalClo.legs.toFixed(2)} clo x 25%</div>
            <div className="border-t pt-1 mt-1 font-semibold">
              = {totalClo?.toFixed(2)} clo overall
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            The per-body-part targets shown below are empirical recommendations for comfort, while
            this overall target is calculated from biophysics.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Consolidated thermal status card that adapts based on risk level.
 * States:
 * - High risk: Rose card with left accent, embedded recommendation and metrics
 * - Moderate risk: Amber warning card with recommendation and metrics
 * - Comfortable: Green affirmation card
 */
export function ThermalStatusCard({ totalClo, targetRange, regionalClo }: ThermalStatusCardProps) {
  if (totalClo === undefined || !targetRange) return null;

  const [targetMin, targetMax] = targetRange;
  const { riskType, severity, delta } = getThermalRiskLevel(totalClo, targetMin, targetMax);

  if (riskType === "comfortable") {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <p className="text-sm font-medium text-green-800">
              You&apos;re within the target insulation range
            </p>
            <p className="text-xs text-green-700/80 mt-1">
              Current: {totalClo.toFixed(1)} clo · Target: {targetMin.toFixed(1)}-{targetMax.toFixed(1)} clo
            </p>
          </div>
          {regionalClo && <CloInfoPopover regionalClo={regionalClo} totalClo={totalClo} />}
        </div>
      </div>
    );
  }

  if (riskType === "cold" && severity === "moderate") {
    const recommendation = getRecommendation("cold", "moderate");

    return (
      <div className="rounded-lg border-l-4 border-l-amber-400 border border-amber-200 bg-amber-50 px-4 py-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="size-4 mt-0.5 flex-shrink-0 text-amber-500" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">Cold Risk — Moderate</p>
            <p className="text-sm text-amber-700 mt-0.5">
              You are under target insulation by {delta.toFixed(1)} clo
            </p>
            <p className="text-sm text-amber-700 mt-2">{recommendation}</p>
            <p className="text-xs text-amber-600/70 mt-2">
              Current: {totalClo.toFixed(1)} clo · Target: {targetMin.toFixed(1)}-{targetMax.toFixed(1)} clo
            </p>
          </div>
          {regionalClo && <CloInfoPopover regionalClo={regionalClo} totalClo={totalClo} />}
        </div>
      </div>
    );
  }

  if (riskType === "cold") {
    const recommendation = getRecommendation("cold", "high");

    return (
      <div className="rounded-lg border-l-4 border-l-rose-400 border border-rose-200 bg-rose-50 px-4 py-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="size-4 mt-0.5 flex-shrink-0 text-rose-500" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-rose-800">Cold Stress Risk — High</p>
            <p className="text-sm text-rose-700 mt-0.5">
              You are under target insulation by {delta.toFixed(1)} clo
            </p>
            <p className="text-sm text-rose-700 mt-2">{recommendation}</p>
            <p className="text-xs text-rose-600/70 mt-2">
              Current: {totalClo.toFixed(1)} clo · Target: {targetMin.toFixed(1)}-{targetMax.toFixed(1)} clo
            </p>
          </div>
          {regionalClo && <CloInfoPopover regionalClo={regionalClo} totalClo={totalClo} />}
        </div>
      </div>
    );
  }

  const recommendation = getRecommendation("overheat", severity);
  const highOverheat = severity === "high";

  return (
    <div
      className={cn(
        "rounded-lg border-l-4 border px-4 py-3",
        highOverheat
          ? "border-l-orange-500 border-orange-200 bg-orange-50"
          : "border-l-amber-400 border-amber-200 bg-amber-50"
      )}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle
          className={cn(
            "size-4 mt-0.5 flex-shrink-0",
            highOverheat ? "text-orange-500" : "text-amber-500"
          )}
        />
        <div className="flex-1">
          <p className={cn("text-sm font-semibold", highOverheat ? "text-orange-800" : "text-amber-800")}>
            Overheating Risk — {highOverheat ? "High" : "Moderate"}
          </p>
          <p className={cn("text-sm mt-0.5", highOverheat ? "text-orange-700" : "text-amber-700")}>
            You are above target insulation by {delta.toFixed(1)} clo
          </p>
          <p className={cn("text-sm mt-2", highOverheat ? "text-orange-700" : "text-amber-700")}>{recommendation}</p>
          <p className={cn("text-xs mt-2", highOverheat ? "text-orange-600/70" : "text-amber-600/70")}>
            Current: {totalClo.toFixed(1)} clo · Target: {targetMin.toFixed(1)}-{targetMax.toFixed(1)} clo
          </p>
        </div>
        {regionalClo && <CloInfoPopover regionalClo={regionalClo} totalClo={totalClo} />}
      </div>
    </div>
  );
}
