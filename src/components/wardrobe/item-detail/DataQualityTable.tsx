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
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <tbody className="divide-y">
            <tr>
              <td className="px-3 py-1.5 text-muted-foreground">Method</td>
              <td className="px-3 py-1.5 text-right">{formatEstimationMethod(estimationMethod)}</td>
            </tr>
            <tr>
              <td className="px-3 py-1.5 text-muted-foreground">Confidence</td>
              <td className="px-3 py-1.5 text-right">{formatConfidence(confidenceScore)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
