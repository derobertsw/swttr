import { AlertTriangle, Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RegionalClo } from "@/types/biophysics";

interface ThermalStatusCardProps {
  totalClo: number | undefined;
  targetRange: [number, number] | undefined;
  regionalClo?: RegionalClo;
}

/**
 * Determines risk level based on insulation deficit
 */
function getThermalRiskLevel(totalClo: number, targetMin: number, targetNeutral: number): {
  riskLevel: "comfortable" | "moderate" | "high";
  deficit: number;
} {
  const deficit = targetNeutral - totalClo;
  const deficitPercent = (deficit / targetNeutral) * 100;

  if (totalClo >= targetMin) {
    return { riskLevel: "comfortable", deficit: Math.max(0, deficit) };
  } else if (deficitPercent <= 50) {
    return { riskLevel: "moderate", deficit };
  } else {
    return { riskLevel: "high", deficit };
  }
}

/**
 * Returns a recommendation message based on insulation deficit
 */
function getRecommendation(deficit: number, targetNeutral: number): string {
  const deficitPercent = (deficit / targetNeutral) * 100;

  if (deficitPercent > 70) {
    return "Add a midlayer and consider warmer base layers";
  } else if (deficitPercent > 40) {
    return "Add a midlayer to improve warmth";
  } else {
    return "Consider adding a light midlayer";
  }
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

  const [targetMin, targetNeutral] = targetRange;
  const { riskLevel, deficit } = getThermalRiskLevel(totalClo, targetMin, targetNeutral);

  if (riskLevel === "comfortable") {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <p className="text-sm font-medium text-green-800">
              You&apos;re well layered for current conditions
            </p>
          </div>
          {regionalClo && <CloInfoPopover regionalClo={regionalClo} totalClo={totalClo} />}
        </div>
      </div>
    );
  }

  if (riskLevel === "moderate") {
    const recommendation = getRecommendation(deficit, targetNeutral);

    return (
      <div className="rounded-lg border-l-4 border-l-amber-400 border border-amber-200 bg-amber-50 px-4 py-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="size-4 mt-0.5 flex-shrink-0 text-amber-500" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">Cold Risk — Moderate</p>
            <p className="text-sm text-amber-700 mt-0.5">
              You are under target insulation by {deficit.toFixed(1)} clo
            </p>
            <p className="text-sm text-amber-700 mt-2">{recommendation}</p>
            <p className="text-xs text-amber-600/70 mt-2">
              Current: {totalClo.toFixed(1)} clo · Target: {targetNeutral.toFixed(1)} clo
            </p>
          </div>
          {regionalClo && <CloInfoPopover regionalClo={regionalClo} totalClo={totalClo} />}
        </div>
      </div>
    );
  }

  const recommendation = getRecommendation(deficit, targetNeutral);

  return (
    <div className="rounded-lg border-l-4 border-l-rose-400 border border-rose-200 bg-rose-50 px-4 py-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="size-4 mt-0.5 flex-shrink-0 text-rose-500" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-rose-800">Cold Stress Risk — High</p>
          <p className="text-sm text-rose-700 mt-0.5">
            You are under target insulation by {deficit.toFixed(1)} clo
          </p>
          <p className="text-sm text-rose-700 mt-2">{recommendation}</p>
          <p className="text-xs text-rose-600/70 mt-2">
            Current: {totalClo.toFixed(1)} clo · Target: {targetNeutral.toFixed(1)} clo
          </p>
        </div>
        {regionalClo && <CloInfoPopover regionalClo={regionalClo} totalClo={totalClo} />}
      </div>
    </div>
  );
}
