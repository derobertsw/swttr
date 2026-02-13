import { SectionHeader } from "./SectionHeader";
import { WholeBodyCloExplainer } from "./WholeBodyCloExplainer";
import { formatDetailValue } from "./detail-formatters";

type SegmentKey = "wholeBody" | "head" | "torso" | "arms" | "hands" | "legs";

const SEGMENT_LABELS: Record<SegmentKey, string> = {
  wholeBody: "Whole Body",
  head: "Head",
  torso: "Torso",
  arms: "Arms",
  hands: "Hands",
  legs: "Legs",
};

export function ThermalTable({
  title,
  unit,
  metricTooltip,
  head,
  torso,
  arms,
  hands,
  legs,
  wholeBody,
  summaryLabel,
  segments,
  showBreakdown = true,
  showWholeBodyExplainer,
}: {
  title: string;
  unit?: string;
  metricTooltip?: string;
  head?: number | null;
  torso?: number | null;
  arms?: number | null;
  hands?: number | null;
  legs?: number | null;
  wholeBody?: number | null;
  summaryLabel?: string;
  segments?: SegmentKey[];
  showBreakdown?: boolean;
  showWholeBodyExplainer?: boolean;
}) {
  const segmentOrder = segments ?? ["wholeBody", "head", "torso", "arms", "hands", "legs"];
  const values: Record<SegmentKey, number | null | undefined> = {
    wholeBody,
    head,
    torso,
    arms,
    hands,
    legs,
  };

  const resolvedSummaryLabel =
    summaryLabel ??
    (segmentOrder.includes("wholeBody")
      ? "Whole body"
      : segmentOrder.length === 1
        ? SEGMENT_LABELS[segmentOrder[0]]
        : "Primary value");
  const summaryKey = segmentOrder.includes("wholeBody") ? "wholeBody" : segmentOrder[0];

  return (
    <div className="space-y-2.5">
      <SectionHeader tooltip={metricTooltip}>
        {title}
        {unit && ` (${unit})`}
      </SectionHeader>
      <div className="rounded-xl border border-border/70 bg-background/35 p-3">
        <div className="flex items-end justify-between gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/85">
            {resolvedSummaryLabel}
            {summaryKey === "wholeBody" && showWholeBodyExplainer && (
              <WholeBodyCloExplainer
                wholeBody={wholeBody}
                torso={torso}
                arms={arms}
                legs={legs}
              />
            )}
          </div>
          <div className="text-right">
            <div className="font-mono text-2xl font-semibold leading-none tracking-tight text-foreground">
              {formatDetailValue(values[summaryKey])}
            </div>
          </div>
        </div>

        {showBreakdown && segmentOrder.length > 1 && (
          <div className="mt-2">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Segment Breakdown
            </p>
            <div className="overflow-hidden rounded-lg border border-border/70">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/35">
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Segment
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Value
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {segmentOrder.map((segment, index) => (
                    <tr
                      key={segment}
                      className={index % 2 === 0 ? "bg-background/75" : "bg-muted/10"}
                    >
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {SEGMENT_LABELS[segment]}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono font-medium text-foreground">
                        {formatDetailValue(values[segment])}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
