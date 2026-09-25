import type { PhaseEvaluation } from "@/types/biophysics";
import { ThermalGauge, type CloBreakdown } from "./ThermalGauge";
import { RiskCard } from "./RiskCard";

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
 * Whole-body insulation against the target range, with a risk card when
 * outside it. Ski touring shows climb and descent separately.
 */
export function ComfortOverview({ climb, descent }: { climb: PhaseComfort; descent?: PhaseComfort }) {
  if (!descent) {
    return (
      <>
        <ThermalGauge
          totalClo={climb.evaluation?.totalClo}
          targetRange={climb.targetRange}
          showStatusPill={false}
          hideMarkerLabel
          cloBreakdown={toCloBreakdown(climb.evaluation?.breakdown)}
        />
        <RiskCard decision={climb.evaluation?.decision} />
      </>
    );
  }

  return (
    <section className="rounded-xl border border-white/20 bg-white/[0.06] px-3 py-3 sm:px-4">
      <div className="space-y-4">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-white/70">Climb</p>
          <ThermalGauge
            totalClo={climb.evaluation?.totalClo}
            targetRange={climb.targetRange}
            markerLabel=""
            showStatusPill={false}
            hideMarkerLabel
            cloBreakdown={toCloBreakdown(climb.evaluation?.breakdown)}
          />
        </div>
        <RiskCard decision={climb.evaluation?.decision} phase="Climb" />
        <div className="border-t border-white/15 pt-4">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-white/70">Descent</p>
          <ThermalGauge
            totalClo={descent.evaluation?.totalClo}
            targetRange={descent.targetRange}
            markerLabel=""
            showStatusPill={false}
            hideMarkerLabel
            cloBreakdown={toCloBreakdown(descent.evaluation?.breakdown)}
          />
        </div>
        <RiskCard decision={descent.evaluation?.decision} phase="Descent" />
      </div>
    </section>
  );
}
