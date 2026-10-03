import { useId } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ThermalDecision } from "@/types/biophysics";

function riskSummary(decision: ThermalDecision): string {
  const degree = decision.severity === "high" ? "Significantly" : "Slightly";
  return decision.riskType === "cold"
    ? `${degree} under-insulated (+${decision.delta.toFixed(1)} clo needed).`
    : `${degree} over-insulated (-${decision.delta.toFixed(1)} clo advised).`;
}

function immediateAction(decision: ThermalDecision): string {
  if (decision.riskType === "cold") {
    return decision.severity === "high"
      ? "Add a warmer base and an insulating mid-layer now."
      : "Add a light-to-mid insulation layer now.";
  }
  return decision.severity === "high"
    ? "Remove a warm layer and open vents immediately."
    : "Drop one layer or increase venting to avoid overheating.";
}

interface ComfortDecisionProps {
  /** The server's evaluation of the worn layers; nothing shows until it arrives. */
  decision: ThermalDecision | null | undefined;
  /** Prefixes the title, e.g. "Climb" or "Descent". */
  phase?: string;
}

/**
 * The evaluation's verdict on the worn layers, above the outfit: a cold or
 * overheating risk with what to change, or that they're in range.
 */
export function ComfortDecision({ decision, phase }: ComfortDecisionProps) {
  const titleId = useId();
  if (!decision) return null;

  if (decision.riskType === "comfortable") {
    return (
      <p className="flex items-center gap-2 text-sm font-medium text-success">
        <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
        {phase ? `${phase}: in` : "In"} the comfort range for these conditions.
      </p>
    );
  }

  const risk = `${decision.riskType === "cold" ? "Cold" : "Overheating"} risk: ${decision.severity === "high" ? "high" : "moderate"}`;
  const title = phase ? `${phase} ${risk.toLowerCase()}` : risk;

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "flex gap-3 rounded-card p-4",
        decision.severity === "high" ? "bg-destructive-soft" : "bg-warning-soft"
      )}
    >
      <AlertTriangle
        className={cn("mt-0.5 size-5 shrink-0", decision.severity === "high" ? "text-destructive" : "text-warning")}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <h3 id={titleId} className="text-base font-semibold text-foreground">
          {title}
        </h3>
        <p className="mt-1 text-base text-foreground">{immediateAction(decision)}</p>
        <p className="mt-1 text-sm text-muted-foreground">{riskSummary(decision)}</p>
      </div>
    </section>
  );
}
