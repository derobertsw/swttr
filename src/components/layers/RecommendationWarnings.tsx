import { useId } from "react";
import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { TransitionProtocol } from "@/types/biophysics";

interface RecommendationWarningsProps {
  warnings: string[];
  transition?: TransitionProtocol;
  edited: boolean;
}

/** Server warnings and transition steps stay visible outside disclosures. */
export function RecommendationWarnings({ warnings, transition, edited }: RecommendationWarningsProps) {
  const headingId = useId();
  const uniqueWarnings = [...new Set([...warnings, ...(transition?.warnings ?? [])])];
  if (uniqueWarnings.length === 0 && !transition) return null;

  return (
    <Card asChild variant="muted">
      <section aria-labelledby={headingId} className="flex gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
        <div className="min-w-0 [overflow-wrap:anywhere]">
          <h3 id={headingId} className="text-base font-semibold text-foreground">Recommendation warnings</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {edited
              ? "From the original recommendation. Your layer changes have not been checked for weather protection, breathability or transition needs."
              : "For the suggested outfit and conditions."}
          </p>
          {uniqueWarnings.length > 0 && (
            <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm text-foreground">
              {uniqueWarnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          )}
          {transition && (
            <div className="mt-4">
              <h4 className="text-sm font-semibold text-foreground">At the climb-to-descent transition</h4>
              <p className="mt-1 text-sm font-medium text-foreground">
                {transition.priority === "urgent" ? "Urgent transition" : transition.priority === "quick" ? "Quick transition" : "Normal transition"}
                {transition.time_limit_minutes !== null && ` · Suggested time: within ${transition.time_limit_minutes} minutes`}
              </p>
              <ol className="mt-2 flex list-decimal flex-col gap-2 pl-5 text-sm text-foreground">
                {transition.steps.map((step, index) => <li key={`${index}:${step}`}>{step}</li>)}
              </ol>
            </div>
          )}
        </div>
      </section>
    </Card>
  );
}
