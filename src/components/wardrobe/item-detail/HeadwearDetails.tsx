import { WardrobeItem } from "@/types/wardrobe";
import { SectionHeader } from "./SectionHeader";
import { ThermalTable } from "./ThermalTable";
export function HeadwearDetails({ details }: { details: WardrobeItem["details"] }) {
  return (
    <>
      <ThermalTable
        title="Thermal Resistance"
        unit="clo"
        metricTooltip="Rcl measures resistance to dry heat loss. Higher values are warmer."
        summaryLabel="Head"
        head={details.rcl_clo}
        segments={["head"]}
        showBreakdown={false}
      />

      <SectionHeader>Coverage</SectionHeader>
      <div className="overflow-hidden rounded-lg border border-border/70">
        <table className="w-full text-sm">
          <tbody>
            <tr className="bg-background/75">
              <td className="px-3 py-1.5 text-muted-foreground">Ears</td>
              <td className="px-3 py-1.5 text-right font-medium">{details.covers_ears ? "Covered" : "N/A"}</td>
            </tr>
            <tr className="bg-muted/10">
              <td className="px-3 py-1.5 text-muted-foreground">Neck</td>
              <td className="px-3 py-1.5 text-right font-medium">{details.covers_neck ? "Covered" : "N/A"}</td>
            </tr>
            <tr className="bg-background/75">
              <td className="px-3 py-1.5 text-muted-foreground">Face</td>
              <td className="px-3 py-1.5 text-right font-medium">{details.covers_face ? "Covered" : "N/A"}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
