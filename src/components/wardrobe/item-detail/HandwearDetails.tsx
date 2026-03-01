import { WardrobeItem } from "@/types/wardrobe";
import { SectionHeader } from "./SectionHeader";
import { ThermalTable } from "./ThermalTable";
import { formatDetailValue } from "./detail-formatters";

export function HandwearDetails({ details }: { details: WardrobeItem["details"] }) {
  return (
    <>
      <div className="grid grid-cols-3 gap-2 rounded-xl border border-border/60 bg-muted/15 p-2">
        <div className="rounded-lg border border-border/60 bg-background/65 px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Thermal</p>
          <p className="mt-1 font-mono text-lg font-semibold">{formatDetailValue(details.rcl_clo)}</p>
        </div>
        <div className="rounded-lg border border-border/60 bg-background/65 px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Dexterity</p>
          <p className="mt-1 text-sm font-semibold">
            {details.dexterity_score !== undefined ? `${details.dexterity_score}/10` : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-border/60 bg-background/65 px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Type</p>
          <p className="mt-1 truncate text-sm font-semibold">
            {details.handwear_type?.replace(/_/g, " ") ?? "—"}
          </p>
        </div>
      </div>

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
                {details.dexterity_score !== undefined ? `${details.dexterity_score}/10` : "—"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
