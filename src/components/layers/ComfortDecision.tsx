import { useId } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
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
  /**
   * The decision is for the layers before the latest change: "updating"
   * while they're checked, "outdated" when the check failed.
   */
  staleness?: "updating" | "outdated";
}

function StaleLabel({ staleness }: { staleness: "updating" | "outdated" }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground">
      {staleness === "updating" && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
      {staleness === "updating" ? "Updating…" : "Before your change"}
    </span>
  );
}

/**
 * The evaluation's verdict on the worn layers, above the outfit: a cold or
 * overheating risk with what to change, or that they're in range. A verdict
 * on earlier layers stays on screen, labeled as such.
 */
export function ComfortDecision({ decision, phase, staleness }: ComfortDecisionProps) {
  const titleId = useId();
  if (!decision) return null;

  if (decision.riskType === "comfortable") {
    return (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-success">
        <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
        {phase ? `${phase}: in` : "In"} the comfort range for these conditions.
        {staleness && <StaleLabel staleness={staleness} />}
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
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h3 id={titleId} className="text-base font-semibold text-foreground">
            {title}
          </h3>
          {staleness && <StaleLabel staleness={staleness} />}
        </div>
        <p className="mt-1 text-base text-foreground">{immediateAction(decision)}</p>
        <p className="mt-1 text-sm text-muted-foreground">{riskSummary(decision)}</p>
      </div>
    </section>
  );
}
