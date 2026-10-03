import type { PhaseEvaluation } from "@/types/biophysics";
import { ThermalGauge, type CloBreakdown } from "./ThermalGauge";

const REGION_LABELS = { torso: "Torso", arms: "Arms", legs: "Legs" } as const;

interface PhaseComfort {
  evaluation: PhaseEvaluation | undefined;
  targetRange: [number, number] | undefined;
}

/** The server's weighted breakdown as gauge detail lines. */
function toCloBreakdown(breakdown: PhaseEvaluation["breakdown"]): CloBreakdown | undefined {
  if (!breakdown) return undefined;
  return {
    lines: breakdown.regions.map(({ region, clo, weight, contribution }) => ({
      label: REGION_LABELS[region],
      detail: `${clo.toFixed(2)} x ${(weight * 100).toFixed(0)}% = ${contribution.toFixed(2)}`,
    })),
    total: breakdown.total,
  };
}

/**
 * Whole-body insulation against the target range. Ski touring shows climb
 * and descent separately.
 */
export function ComfortOverview({ climb, descent }: { climb: PhaseComfort; descent?: PhaseComfort }) {
  if (!descent) {
    return (
      <ThermalGauge
        totalClo={climb.evaluation?.totalClo}
        targetRange={climb.targetRange}
        showStatusPill={false}
        hideMarkerLabel
        cloBreakdown={toCloBreakdown(climb.evaluation?.breakdown)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {([["Climb", climb], ["Descent", descent]] as const).map(([label, phase]) => (
        <div key={label}>
          <p className="mb-1 text-sm font-semibold text-foreground">{label}</p>
          <ThermalGauge
            totalClo={phase.evaluation?.totalClo}
            targetRange={phase.targetRange}
            markerLabel=""
            showStatusPill={false}
            hideMarkerLabel
            cloBreakdown={toCloBreakdown(phase.evaluation?.breakdown)}
          />
        </div>
      ))}
    </div>
  );
}
