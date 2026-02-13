import { EstimationMethod } from "@/types/garments";
import { formatEstimationMethod, formatConfidence } from "../wardrobe-utils";
import { SectionHeader } from "./SectionHeader";

export function DataQualityTable({
  estimationMethod,
  confidenceScore,
}: {
  estimationMethod?: EstimationMethod;
  confidenceScore?: number;
}) {
  return (
    <>
      <SectionHeader>Data Quality</SectionHeader>
      <div className="overflow-hidden rounded-lg border border-border/70">
        <table className="w-full text-sm">
          <tbody>
            <tr className="bg-background/75">
              <td className="px-3 py-1.5 text-muted-foreground">Method</td>
              <td className="px-3 py-1.5 text-right font-medium">{formatEstimationMethod(estimationMethod)}</td>
            </tr>
            <tr className="bg-muted/10">
              <td className="px-3 py-1.5 text-muted-foreground">Confidence</td>
              <td className="px-3 py-1.5 text-right font-medium">{formatConfidence(confidenceScore)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
