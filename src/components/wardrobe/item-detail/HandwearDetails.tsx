import { WardrobeItem } from "@/types/wardrobe";
import { SectionHeader } from "./SectionHeader";
import { ThermalTable } from "./ThermalTable";

export function HandwearDetails({ details }: { details: WardrobeItem["details"] }) {
  return (
    <>
      <ThermalTable
        title="Thermal Resistance"
        unit="clo"
        metricTooltip="Rcl measures resistance to dry heat loss. Higher values are warmer."
        summaryLabel="Hands"
        hands={details.rcl_clo}
        segments={["hands"]}
        showBreakdown={false}
      />

      <SectionHeader>Performance</SectionHeader>
      <div className="overflow-hidden rounded-lg border border-border/70">
        <table className="w-full text-sm">
          <tbody>
            <tr className="bg-background/75">
              <td className="px-3 py-1.5 text-muted-foreground">Dexterity Score</td>
              <td className="px-3 py-1.5 text-right font-mono font-medium">
                {details.dexterity_score !== undefined ? `${details.dexterity_score}/10` : "N/A"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
