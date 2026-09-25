import { AlertTriangle, ChevronRight } from "lucide-react";
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

interface RiskCardProps {
  decision: ThermalDecision | null | undefined;
  /** Prefixes the title, e.g. "Climb" or "Descent". */
  phase?: string;
}

/** Collapsible warning for a cold or overheating risk; renders nothing when comfortable. */
export function RiskCard({ decision, phase }: RiskCardProps) {
  if (!decision || decision.riskType === "comfortable") return null;

  const isCold = decision.riskType === "cold";
  const risk = isCold ? "Cold Risk" : "Overheating Risk";
  const title = `${phase ? `${phase} ` : ""}${risk} — ${decision.severity === "high" ? "High" : "Moderate"}`;

  return (
    <details
      className={cn(
        "group rounded-lg border px-3 py-2",
        isCold ? "border-sky-400/40 bg-sky-500/15" : "border-amber-400/40 bg-amber-500/15"
      )}
    >
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-2 text-xs font-semibold [&::-webkit-details-marker]:hidden",
          isCold ? "text-sky-200" : "text-amber-200"
        )}
        aria-label={title}
      >
        <AlertTriangle className="size-3.5 shrink-0" />
        <span className="flex-1">{title}</span>
        <ChevronRight className="size-3.5 shrink-0 transition-transform group-open:rotate-90" />
      </summary>
      <div className="mt-2 space-y-1.5 pb-1 text-xs text-white/80">
        <p>{riskSummary(decision)}</p>
        <p>{immediateAction(decision)}</p>
      </div>
    </details>
  );
}
